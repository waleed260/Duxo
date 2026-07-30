import { auth } from "@clerk/nextjs/server";
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
    const adminAuth = getAuth(firebaseAdmin);
    const customToken = await adminAuth.createCustomToken(userId);
    return NextResponse.json({ token: customToken });
  } catch (error) {
    console.error("Firebase custom token generation failed:", error);
    return NextResponse.json(
      { error: "Token generation failed" },
      { status: 500 },
    );
  }
}
