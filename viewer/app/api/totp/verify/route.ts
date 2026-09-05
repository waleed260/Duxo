import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { verifyTOTPCode, verifyBackupCode } from "@/lib/totp";
import { decryptSecret, isTotpConfigured } from "@/lib/totp-server";

/**
 * §2.3 / §8.5 — verify a TOTP code or a backup code.
 *
 * The secret is decrypted here and never leaves the server. The browser used
 * to fetch the ciphertext, derive the key from the uid, decrypt, and compare
 * locally — so the plaintext secret existed in a page context on every login,
 * and the key was derivable by anyone who could read the document.
 *
 * §0.7 — the codes are six digits, so guessing is the obvious attack. Counted
 * per Clerk uid, in-process, same reasoning and same limits as
 * /api/link-device: not a distributed limiter, but it bounds one instance for
 * free, and the uid is the thing an attacker actually has to pay for.
 */

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
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (tooManyAttempts(userId)) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a minute and try again." },
      { status: 429 },
    );
  }

  if (!isTotpConfigured()) {
    return NextResponse.json(
      { error: "Two-factor authentication is not configured on this server." },
      { status: 503 },
    );
  }

  let code: unknown;
  try {
    ({ code } = await request.json());
  } catch {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }
  if (typeof code !== "string" || code.trim().length === 0) {
    return NextResponse.json({ error: "Enter a code." }, { status: 400 });
  }
  const entered = code.trim();

  try {
    const db = getFirestore(getFirebaseAdmin());
    const ref = db.collection("users").doc(userId);
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : undefined;

    if (!data?.totpEnabled) {
      return NextResponse.json(
        { error: "Two-factor authentication is not enabled." },
        { status: 409 },
      );
    }

    // A 6-digit input is a TOTP code; anything else is treated as a backup
    // code, which is the format the UI shows (XXXX-XXXX).
    if (/^\d{6}$/.test(entered)) {
      const secret = decryptSecret(data.totpSecretEncrypted as string, userId);
      if (verifyTOTPCode(secret, entered)) {
        return NextResponse.json({ verified: true, usedBackupCode: false });
      }
      return NextResponse.json({ error: "That code isn't valid." }, { status: 400 });
    }

    const hashes = (data.backupCodeHashes as string[]) ?? [];
    const index = await verifyBackupCode(entered.toUpperCase(), hashes);
    if (index === -1) {
      return NextResponse.json({ error: "That code isn't valid." }, { status: 400 });
    }

    // §8.5 — single use. Removed server-side, so a client that never sends
    // the follow-up write cannot leave a spent code usable, which is what
    // happened when the browser owned this step.
    const remaining = hashes.filter((_, i) => i !== index);
    await ref.update({ backupCodeHashes: remaining });

    return NextResponse.json({
      verified: true,
      usedBackupCode: true,
      remainingBackupCodes: remaining.length,
    });
  } catch (error) {
    console.error("TOTP verification failed:", error);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
