/**
 * §8.1 — server-side state and origin policy for the WebAuthn ceremonies.
 *
 * Kept out of the route files because both routes need it and because the
 * two decisions here are the ones worth reviewing on their own: where a
 * challenge lives, and which origins are allowed to complete a ceremony.
 */

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

type Ceremony = "register" | "authenticate";

/**
 * Outstanding challenges, keyed by uid + ceremony.
 *
 * In-process, like the rate limiters in /api/link-device and
 * /api/resolve-code, and with the same trade acknowledged: this is not shared
 * across instances, so a ceremony started on one and finished on another
 * fails and the user retries. That is an availability cost on a
 * multi-instance deploy, never a security one — a challenge that cannot be
 * found is rejected, never assumed valid.
 *
 * Single-use is enforced by `takeChallenge` deleting on read. A replayed
 * assertion therefore fails on the second attempt even within the TTL.
 */
const CHALLENGES = new Map<string, { challenge: string; expiresAt: number }>();

function key(uid: string, ceremony: Ceremony) {
  return `${ceremony}:${uid}`;
}

export function rememberChallenge(uid: string, ceremony: Ceremony, challenge: string) {
  // Opportunistic sweep — this map is only ever a handful of entries, and it
  // keeps an abandoned ceremony from pinning memory until the process exits.
  const now = Date.now();
  for (const [k, v] of CHALLENGES) {
    if (v.expiresAt <= now) CHALLENGES.delete(k);
  }
  CHALLENGES.set(key(uid, ceremony), {
    challenge,
    expiresAt: now + CHALLENGE_TTL_MS,
  });
}

/** Read and consume. Returns null if absent or expired. */
export function takeChallenge(uid: string, ceremony: Ceremony): string | null {
  const k = key(uid, ceremony);
  const entry = CHALLENGES.get(k);
  CHALLENGES.delete(k);
  if (!entry || entry.expiresAt <= Date.now()) return null;
  return entry.challenge;
}

/** Test seam — the suite needs a clean map between cases. */
export function __resetChallenges() {
  CHALLENGES.clear();
}

/**
 * The origin and rpID a ceremony must have come from.
 *
 * WebAuthn binds a credential to an rpID and an assertion to an origin;
 * verifying against whatever the request claims would defeat both. So the
 * request's `Origin` header is checked against an allowlist rather than
 * trusted:
 *
 *   - `NEXT_PUBLIC_SITE_URL` when set — the real deployment.
 *   - localhost on any port in development, because that is where this runs
 *     today and the spec makes localhost a secure context.
 *
 * Returning null means "refuse the ceremony", which is the safe direction:
 * an unknown origin gets no challenge rather than a challenge it could
 * complete.
 */
export function relyingParty(
  request: Request,
): { origin: string; rpID: string } | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }

  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    try {
      const allowed = new URL(configured);
      if (url.origin === allowed.origin) {
        return { origin: url.origin, rpID: allowed.hostname };
      }
    } catch {
      // A malformed NEXT_PUBLIC_SITE_URL should not silently widen the
      // allowlist to everything; fall through to the localhost rule.
    }
  }

  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (isLocalhost && process.env.NODE_ENV !== "production") {
    return { origin: url.origin, rpID: url.hostname };
  }

  return null;
}
