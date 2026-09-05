import { auth } from "@clerk/nextjs/server";
import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { generateTOTPSecret } from "@/lib/totp";
import { isTotpConfigured } from "@/lib/totp-server";
import { rememberPendingSecret } from "@/lib/totp-pending";

/**
 * §2.3 — begin TOTP enrolment.
 *
 * The secret is generated here, not in the browser. The browser still receives
 * it once, because the user has to scan or type it into an authenticator app
 * and there is no way around that — but it is generated server-side, held
 * server-side pending activation, and after /api/totp/activate the browser
 * never sees it again. Verification later happens entirely on the server.
 *
 * Nothing is written to Firestore yet. A secret stored before the user has
 * proved they can produce a code from it locks people out of their own
 * account: `totpEnabled` would be true for a secret that never reached an app.
 */
export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Checked before generating anything: enrolment that cannot be completed
  // should fail at the first step with the real reason, not at activation
  // with a decryption error.
  if (!isTotpConfigured()) {
    return NextResponse.json(
      {
        error:
          "Two-factor authentication is not configured on this server. " +
          "TOTP_MASTER_KEY must be set.",
      },
      { status: 503 },
    );
  }

  const user = await currentUser();
  const label =
    user?.emailAddresses?.find((e) => e.id === user?.primaryEmailAddressId)
      ?.emailAddress ?? userId;

  const { secret, otpauthUri } = generateTOTPSecret(label);
  rememberPendingSecret(userId, secret);

  // `secret` is returned for the manual-entry fallback shown next to the QR.
  return NextResponse.json({ secret, otpauthUri });
}
