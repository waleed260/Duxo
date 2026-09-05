/**
 * §2.3 — proof that a session cleared its second factor.
 *
 * WHAT WAS WRONG. `/verify-2fa` set `totpSessionFlag.verified = true` — a
 * module-level boolean in the browser — and then navigated to /dashboard. The
 * middleware only ever checked for a Clerk session, so requesting /dashboard
 * directly skipped the whole page. The second factor was decorative: every
 * check that mattered ran somewhere the user controls.
 *
 * WHAT THIS IS. A short-lived token, signed server-side, carried in an
 * HttpOnly cookie the page cannot read or forge, and verified in middleware
 * before a protected route renders.
 *
 * WEB CRYPTO ONLY, DELIBERATELY. Next.js middleware runs in the edge runtime:
 * no `node:crypto`, and no `firebase-admin` to ask Firestore whether this user
 * even has 2FA enabled. That constraint drives two decisions elsewhere — the
 * "is 2FA on" bit rides on Clerk's session claims rather than the database,
 * and everything here uses `crypto.subtle`, which exists in both runtimes.
 *
 * The token binds to the uid, so one user's proof cannot be replayed as
 * another's, and carries its own expiry inside the signed payload rather than
 * relying on the cookie's lifetime — a cookie's Max-Age is a client-side hint,
 * and the client is what we are defending against.
 */

export const TWO_FACTOR_COOKIE = "duxo_2fa";

/** How long one verification lasts before the user is asked again. */
export const TWO_FACTOR_TTL_SECONDS = 12 * 60 * 60;

const KEY_INFO = "duxo-2fa-cookie-v1";

function b64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Uint8Array<ArrayBuffer>, not a bare Uint8Array: the default type parameter
// is ArrayBufferLike, which admits SharedArrayBuffer, and WebCrypto's
// BufferSource does not. Same friction as the PBKDF2 salt in lib/totp-server —
// worth naming the type rather than casting it away, since the cast is what
// hid a realm bug there.
function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Derive the signing key from the master secret.
 *
 * HKDF with its own `info` so this key is independent of the AES key
 * lib/totp-server.ts derives from the same master for secret storage. Reusing
 * one secret for two purposes is fine exactly when the derivations are
 * separated like this, and not otherwise.
 */
async function signingKey(): Promise<CryptoKey | null> {
  const master = process.env.TOTP_MASTER_KEY;
  if (!master || master.trim().length < 16) return null;

  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(master),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      // Fixed salt: the master key is already high-entropy, and a random salt
      // would have to be stored somewhere both runtimes can read it.
      salt: new TextEncoder().encode("duxo-2fa"),
      info: new TextEncoder().encode(KEY_INFO),
    },
    base,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** `<uid>.<expiry>` — the exact bytes that get signed. */
function payload(uid: string, expiresAt: number): string {
  return `${uid}.${expiresAt}`;
}

/**
 * Mint a proof for `uid`. Returns null when no master key is configured, which
 * the caller must treat as "cannot enforce 2FA" rather than "2FA passed".
 */
export async function issueTwoFactorToken(uid: string): Promise<string | null> {
  const key = await signingKey();
  if (!key) return null;

  const expiresAt = Math.floor(Date.now() / 1000) + TWO_FACTOR_TTL_SECONDS;
  const body = payload(uid, expiresAt);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${b64urlEncode(new Uint8Array(sig))}`;
}

/**
 * True only for a well-formed, unexpired token whose signature verifies and
 * whose uid matches. Every failure path returns false — a token that cannot
 * be checked is not a token that passed.
 */
export async function verifyTwoFactorToken(
  token: string | undefined,
  uid: string,
): Promise<boolean> {
  if (!token) return false;

  // The uid may contain no dots (Clerk ids are `user_...`), so splitting from
  // the right keeps this unambiguous.
  const lastDot = token.lastIndexOf(".");
  if (lastDot <= 0) return false;
  const body = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);

  const firstDot = body.indexOf(".");
  if (firstDot <= 0) return false;
  const tokenUid = body.slice(0, firstDot);
  const expiresAt = Number(body.slice(firstDot + 1));

  if (tokenUid !== uid) return false;
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    return false;
  }

  const key = await signingKey();
  if (!key) return false;

  try {
    // crypto.subtle.verify is constant-time, which is why the signature is
    // never compared with ===.
    return await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlDecode(sig),
      new TextEncoder().encode(body),
    );
  } catch {
    return false;
  }
}

/** Cookie attributes. Shared so the set and clear paths cannot drift apart. */
export function twoFactorCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}
