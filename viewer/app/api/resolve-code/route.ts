import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getDatabase } from "firebase-admin/database";
import { getFirebaseAdmin } from "@/lib/firebase-admin";

/**
 * §0.7 — resolve an 8-digit session code to its session id.
 *
 * This used to be a direct `get(ref(db, "codes/" + code))` from the dashboard,
 * which required `codes/$code` to be world-readable by any signed-in account.
 * Two things followed from that, and both are why this route exists:
 *
 *   1. Enumeration was free and unmetered. §0.7 leans on "100M combinations
 *      AND 5 attempts/min per IP"; the combinations were real but the rate
 *      limit was not — the `rateLimit` node in the rules had nothing writing
 *      to it. A single free account could scan for live codes as fast as RTDB
 *      would answer, and every hit is a session it can then claim, putting an
 *      attacker-chosen email in front of the host's Allow dialog. §2.4 is the
 *      last line of defence there, and it should not be the first.
 *   2. Anyone could overwrite or delete any mapping, because `.write` was
 *      also just `auth != null`. Repointing a live code at your own session
 *      turns "read the code down the phone" into connecting the caller to a
 *      machine that is not the one they were told about.
 *
 * With the lookup server-side, the rules can drop public read entirely: the
 * Admin SDK bypasses them, and no client ever touches `codes/` again.
 */

const CODE_PATTERN = /^[0-9]{8}$/;

// §0.7 — "5 attempts/min per IP". Counted per Clerk user rather than per IP:
// the route requires a session, and a uid is the thing an attacker actually
// has to pay for, where an IP is a proxy hop away. In-process state is not a
// distributed limiter, but it bounds a single instance at no cost, which is
// the right trade at this scale (same reasoning as /api/link-device).
const ATTEMPTS = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
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

  let code: unknown;
  try {
    ({ code } = await request.json());
  } catch {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }

  // The display form is grouped "XXXX XXXX"; someone pasting what they see
  // should not be told their own code is malformed.
  const normalized =
    typeof code === "string" ? code.replace(/\s+/g, "") : "";

  if (!CODE_PATTERN.test(normalized)) {
    return NextResponse.json(
      { error: "Codes are 8 digits — check and try again." },
      { status: 400 },
    );
  }

  try {
    const db = getDatabase(getFirebaseAdmin());
    const snapshot = await db.ref(`codes/${normalized}`).get();

    // §0.7 — the node is `{ sessionId, hostId }`; hostId is what lets the
    // rules pin writes to the host that created the code, and is not
    // something the viewer needs to be told.
    const node = snapshot.exists()
      ? (snapshot.val() as { sessionId?: unknown } | null)
      : null;
    const sessionId = node?.sessionId;

    // Deliberately the same message and status for "no such code" as for
    // "code points at nothing usable": distinguishing them would hand an
    // enumerator a way to tell a live code from a dead one.
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      return NextResponse.json(
        {
          error:
            "That code isn't valid. Check with the person who shared it.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, sessionId });
  } catch (error) {
    console.error("Code resolution failed:", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
