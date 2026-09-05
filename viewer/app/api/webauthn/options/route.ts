import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  generateRegistrationOptions,
  generateAuthenticationOptions,
} from "@simplewebauthn/server";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { rememberChallenge, relyingParty } from "@/lib/webauthn-server";

/**
 * §8.1 — issue a WebAuthn ceremony challenge.
 *
 * The challenge is generated *here* and remembered server-side. That is the
 * whole point of this route existing: a challenge the client invents and then
 * checks for itself proves nothing, because a caller who controls the client
 * controls both halves. lib/webauthn.ts used to do exactly that — generate a
 * challenge in the browser, never look at it again, and treat any assertion
 * carrying a known credential id as success.
 *
 * The uid comes from the Clerk session and never from the request body, so a
 * caller can only ever start a ceremony for themselves. Same rule as
 * /api/link-device, and for the same reason.
 */
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let mode: unknown;
  try {
    ({ mode } = await request.json());
  } catch {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }

  if (mode !== "register" && mode !== "authenticate") {
    return NextResponse.json({ error: "Unknown ceremony" }, { status: 400 });
  }

  const rp = relyingParty(request);
  if (!rp) {
    return NextResponse.json(
      { error: "Origin not permitted for WebAuthn" },
      { status: 400 },
    );
  }

  try {
    const db = getFirestore(getFirebaseAdmin());
    const snap = await db.collection("users").doc(userId).collection("webauthn").get();
    const stored = snap.docs.map((d) => d.data() as { id: string; transports?: string[] });

    if (mode === "register") {
      const options = await generateRegistrationOptions({
        rpName: "Duxo",
        rpID: rp.rpID,
        userName: userId,
        userID: new TextEncoder().encode(userId),
        attestationType: "none",
        // Registering the same authenticator twice leaves a duplicate the user
        // cannot tell apart in /settings.
        excludeCredentials: stored.map((c) => ({ id: c.id })),
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "preferred",
        },
      });
      rememberChallenge(userId, "register", options.challenge);
      return NextResponse.json(options);
    }

    if (stored.length === 0) {
      return NextResponse.json(
        { error: "No passkeys registered for this account." },
        { status: 409 },
      );
    }

    const options = await generateAuthenticationOptions({
      rpID: rp.rpID,
      // Only this user's credentials. Without it the browser would offer any
      // passkey for the origin, and the verify step would then reject it —
      // a worse experience for the same security.
      allowCredentials: stored.map((c) => ({
        id: c.id,
        transports: c.transports as never,
      })),
      userVerification: "preferred",
    });
    rememberChallenge(userId, "authenticate", options.challenge);
    return NextResponse.json(options);
  } catch (error) {
    console.error("WebAuthn options failed:", error);
    return NextResponse.json({ error: "Could not start ceremony" }, { status: 500 });
  }
}
