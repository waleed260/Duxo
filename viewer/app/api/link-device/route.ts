import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { firebaseAdmin } from "@/lib/firebase-admin";

/**
 * Device pairing — the host agent's half of authentication.
 *
 * The host agent cannot authenticate the way the viewer does. The viewer signs
 * in with Clerk and this server mints a Firebase custom token for it (§2.1);
 * the host has no Clerk session, and the Firebase service-account key that
 * signs custom tokens must never ship inside a binary users download. So the
 * host publishes a short-lived pairing code, and this route is where a
 * signed-in user turns that code into a real credential for their own uid.
 *
 * The token is minted for `userId` — the *caller's* uid, taken from the Clerk
 * session and never from the request body. A user can therefore only ever link
 * a device to their own account, which is what makes the `hostId == auth.uid`
 * rule in §10.2 hold.
 *
 * §0.7 — the pairing node is unauthenticated-writable by design (the host has
 * no credential yet, which is the whole point), so it is treated as untrusted:
 * every field read back is validated, and the node is single-use.
 */

const PAIRING_TTL_MS = 10 * 60 * 1000;
const CODE_PATTERN = /^[A-Z2-9]{6}$/;

// §0.7 — brute-forcing a 6-character code is the obvious attack. In-process
// counting is not a distributed rate limiter, but it bounds a single instance
// and costs nothing, which is the right trade at this scale.
const ATTEMPTS = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 60 * 1000;

function tooManyAttempts(userId: string): boolean {
  const now = Date.now();
  const record = ATTEMPTS.get(userId);
  if (!record || now > record.resetAt) {
    ATTEMPTS.set(userId, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return false;
  }
  if (record.count >= MAX_ATTEMPTS) return true;
  record.count += 1;
  return false;
}

export async function POST(request: Request) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (tooManyAttempts(userId)) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a minute and try again." },
      { status: 429 },
    );
  }

  let code: unknown;
  try {
    ({ code } = await request.json());
  } catch {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }

  if (typeof code !== "string" || !CODE_PATTERN.test(code)) {
    return NextResponse.json(
      { error: "That doesn't look like a device code." },
      { status: 400 },
    );
  }

  try {
    const db = getDatabase(firebaseAdmin);
    const nodeRef = db.ref(`pairings/${code}`);
    const snapshot = await nodeRef.get();

    if (!snapshot.exists()) {
      return NextResponse.json(
        { error: "That code isn't valid. Check the code on your device." },
        { status: 404 },
      );
    }

    const pairing = snapshot.val() as {
      deviceName?: unknown;
      platform?: unknown;
      createdAt?: unknown;
      claimed?: unknown;
    };

    // Single use: a code that has already produced a token must not produce a
    // second one, or a stolen code stays useful after a successful pairing.
    if (pairing.claimed === true) {
      return NextResponse.json(
        { error: "That code has already been used. Generate a new one." },
        { status: 409 },
      );
    }

    const createdAt =
      typeof pairing.createdAt === "number" ? pairing.createdAt : 0;
    if (!createdAt || Date.now() - createdAt > PAIRING_TTL_MS) {
      await nodeRef.remove();
      return NextResponse.json(
        { error: "That code has expired. Generate a new one on your device." },
        { status: 410 },
      );
    }

    // The uid comes from the Clerk session, never from the request.
    const customToken = await getAuth(firebaseAdmin).createCustomToken(userId);

    await nodeRef.update({ claimed: true, customToken });

    return NextResponse.json({
      ok: true,
      // Echoed so the UI can confirm *which* machine was just linked — the
      // user should see the device name before trusting the pairing.
      deviceName:
        typeof pairing.deviceName === "string" ? pairing.deviceName : "Unknown device",
      platform: typeof pairing.platform === "string" ? pairing.platform : "unknown",
    });
  } catch (error) {
    console.error("Device pairing failed:", error);
    return NextResponse.json({ error: "Pairing failed" }, { status: 500 });
  }
}
