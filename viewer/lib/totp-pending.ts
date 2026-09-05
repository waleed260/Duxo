/**
 * §2.3 — TOTP secrets that have been generated but not yet proved.
 *
 * Enrolment is two calls (setup, then activate), so the secret has to survive
 * between them. It is held here rather than written to Firestore because a
 * secret persisted before the user has produced a valid code from it is a
 * lockout waiting to happen: `totpEnabled` would be true for a secret that
 * never made it into an authenticator app.
 *
 * In-process and short-lived, the same trade as the rate limiters in
 * /api/link-device and the challenge store in /lib/webauthn-server. On a
 * multi-instance deploy an enrolment started on one instance and activated on
 * another fails and the user restarts it — an availability cost, never a
 * security one, because a secret that cannot be found is refused rather than
 * assumed.
 */

const PENDING_TTL_MS = 10 * 60 * 1000;

const PENDING = new Map<string, { secret: string; expiresAt: number }>();

export function rememberPendingSecret(uid: string, secret: string) {
  const now = Date.now();
  for (const [k, v] of PENDING) {
    if (v.expiresAt <= now) PENDING.delete(k);
  }
  PENDING.set(uid, { secret, expiresAt: now + PENDING_TTL_MS });
}

/**
 * Read and consume. Returns null if absent or expired.
 *
 * Single-use: activation either completes with this secret or starts over.
 * Leaving it readable would let a second activation attempt race the first.
 */
export function takePendingSecret(uid: string): string | null {
  const entry = PENDING.get(uid);
  PENDING.delete(uid);
  if (!entry || entry.expiresAt <= Date.now()) return null;
  return entry.secret;
}

/** Test seam. */
export function __resetPending() {
  PENDING.clear();
}
