import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { verifyTOTPCode, generateBackupCodes } from "@/lib/totp";
import { encryptSecret, isTotpConfigured } from "@/lib/totp-server";
import { takePendingSecret } from "@/lib/totp-pending";

/**
 * §2.3 / §8.5 — finish TOTP enrolment.
 *
 * Takes the code the user read out of their authenticator app and, only if it
 * matches the pending secret, encrypts that secret under the server's master
 * key and marks TOTP enabled. Proving the code first is what stops a user
 * enabling 2FA against a secret their app never received.
 *
 * The backup codes are returned exactly once, in plaintext, and only their
 * SHA-256 hashes are stored — there is no second chance to read them, which
 * the UI has to say clearly.
 *
 * The uid comes from the Clerk session, never the body.
 */
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  if (typeof code !== "string" || !/^\d{6}$/.test(code.trim())) {
    return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });
  }

  // Consumed on read: a failed activation starts over rather than allowing
  // repeated guesses against one pending secret.
  const secret = takePendingSecret(userId);
  if (!secret) {
    return NextResponse.json(
      { error: "Setup expired or was not started. Begin again." },
      { status: 400 },
    );
  }

  if (!verifyTOTPCode(secret, code.trim())) {
    return NextResponse.json(
      { error: "That code doesn't match — check your authenticator app." },
      { status: 400 },
    );
  }

  try {
    const codes = await generateBackupCodes();
    const db = getFirestore(getFirebaseAdmin());
    await db
      .collection("users")
      .doc(userId)
      .set(
        {
          totpEnabled: true,
          totpSecretEncrypted: encryptSecret(secret, userId),
          backupCodeHashes: codes.map((c) => c.hash),
          totpEnabledAt: Date.now(),
        },
        { merge: true },
      );

    return NextResponse.json({
      enabled: true,
      // Shown once. Only the hashes above survive.
      backupCodes: codes.map((c) => c.plaintext),
    });
  } catch (error) {
    console.error("TOTP activation failed:", error);
    return NextResponse.json({ error: "Could not enable 2FA" }, { status: 500 });
  }
}
