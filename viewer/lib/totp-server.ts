import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * §2.3 — encryption for the stored TOTP secret, with a key the client cannot
 * derive.
 *
 * WHAT WAS WRONG. The previous scheme ran PBKDF2 with the user's uid as the
 * password and stored the result at `users/{uid}` — so the password was the
 * document path. Anyone who could read the document already held every input
 * needed to derive the key, which made it obfuscation rather than
 * confidentiality against exactly the compromise it existed to survive. The
 * 100k iterations only slow an attacker who has to guess; that one did not.
 *
 * WHAT THIS DOES INSTEAD. The key is derived from a master secret that lives
 * only in the server environment and is never sent to a browser:
 *
 *     key = HKDF-SHA256(TOTP_MASTER_KEY, salt = random 16B,
 *                       info = "duxo-totp-v1:" + uid)
 *
 * A Firestore read now yields salt, IV and ciphertext — and no key. Recovering
 * a secret requires the server's environment as well as its database, which is
 * the property §2.3 was claiming all along.
 *
 * The uid stays in the derivation as HKDF `info`, so one user's ciphertext
 * cannot be decrypted under another's context even with the master key. It is
 * domain separation, not the secret.
 *
 * FAIL CLOSED. With no master key configured this throws rather than falling
 * back to something weaker. A 2FA secret quietly stored under a guessable key
 * is worse than a setup flow that refuses to finish, because only one of those
 * is visible.
 */

const INFO_PREFIX = "duxo-totp-v1:";
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export class TotpKeyUnavailableError extends Error {
  constructor() {
    super(
      "TOTP_MASTER_KEY is not set. Generate one with " +
        "`openssl rand -base64 32` and set it in the server environment; " +
        "TOTP cannot be enabled or verified without it.",
    );
    this.name = "TotpKeyUnavailableError";
  }
}

function masterKey(): Buffer {
  const raw = process.env.TOTP_MASTER_KEY;
  if (!raw || raw.trim().length < 16) throw new TotpKeyUnavailableError();
  return Buffer.from(raw, "utf8");
}

/** True when the server is configured to store TOTP secrets at all. */
export function isTotpConfigured(): boolean {
  const raw = process.env.TOTP_MASTER_KEY;
  return Boolean(raw && raw.trim().length >= 16);
}

function deriveKey(uid: string, salt: Buffer): Buffer {
  return Buffer.from(
    hkdfSync("sha256", masterKey(), salt, INFO_PREFIX + uid, KEY_BYTES),
  );
}

/**
 * Encrypt a base32 TOTP secret for storage.
 * Layout: base64( salt(16) | iv(12) | tag(16) | ciphertext ).
 */
export function encryptSecret(secretBase32: string, uid: string): string {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(uid, salt), iv);
  const ciphertext = Buffer.concat([
    cipher.update(secretBase32, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([salt, iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

/**
 * Decrypt a stored secret. Throws on a wrong key, a wrong uid, or any
 * tampering — AES-GCM's tag check is what makes the last one true, so a
 * modified ciphertext fails loudly instead of decrypting to noise a TOTP
 * comparison would then quietly reject.
 */
export function decryptSecret(encrypted: string, uid: string): string {
  const buf = Buffer.from(encrypted, "base64");
  if (buf.length <= SALT_BYTES + IV_BYTES + TAG_BYTES) {
    throw new Error("Invalid encrypted secret: too short");
  }
  const salt = buf.subarray(0, SALT_BYTES);
  const iv = buf.subarray(SALT_BYTES, SALT_BYTES + IV_BYTES);
  const tag = buf.subarray(SALT_BYTES + IV_BYTES, SALT_BYTES + IV_BYTES + TAG_BYTES);
  const ciphertext = buf.subarray(SALT_BYTES + IV_BYTES + TAG_BYTES);

  const decipher = createDecipheriv("aes-256-gcm", deriveKey(uid, salt), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
