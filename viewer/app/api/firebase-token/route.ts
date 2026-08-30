import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { firebaseAdmin } from "@/lib/firebase-admin";

const RATE_LIMIT = new Map<string, { count: number; resetAt: number }>();
const MAX_REQUESTS = 10;
const WINDOW_MS = 60 * 1000;

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const record = RATE_LIMIT.get(userId);

  if (!record || now > record.resetAt) {
    RATE_LIMIT.set(userId, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  if (record.count >= MAX_REQUESTS) {
    return true;
  }

  record.count += 1;
  return false;
}

export async function POST() {
  const { userId } = auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isRateLimited(userId)) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  try {
    // §2.5 — the host displays this email in the Allow/Deny dialog, taken
    // from the signature-checked token and never from RTDB. A custom token
    // carries only the claims set here, so without this the ID token has no
    // `email` at all: the host's `VerifiedClaims` failed to deserialise and
    // the failure was reported as an invalid signature, denying every viewer.
    //
    // Clerk is the source of truth for both the address and whether it was
    // confirmed — the dialog says which, so passing the flag through honestly
    // matters as much as passing the address.
    const user = await currentUser();
    const primary = user?.emailAddresses?.find(
      (e) => e.id === user?.primaryEmailAddressId,
    );

    const claims: Record<string, unknown> = {};
    if (primary?.emailAddress) {
      claims.email = primary.emailAddress;
      claims.email_verified =
        primary.verification?.status === "verified";
    }

    const adminAuth = getAuth(firebaseAdmin);
    const customToken = await adminAuth.createCustomToken(userId, claims);
    return NextResponse.json({ token: customToken });
  } catch (error) {
    console.error("Firebase custom token generation failed:", error);
    return NextResponse.json(
      { error: "Token generation failed" },
      { status: 500 },
    );
  }
}
