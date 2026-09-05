/**
 * Duxo TOTP 2FA — §2.3.
 *
 * Uses the `otpauth` library for TOTP secret generation + code verification,
 * and `qrcode` for QR code SVG rendering.
 *
 * Secret storage: encrypted in Firestore using the Web Crypto API
 * (AES-256-GCM with PBKDF2 key derivation). Backup codes are stored
 * as SHA-256 hashes.
 *
 * Flow:
 *   1. Client generates a TOTP secret (base32-encoded).
 *   2. Renders a QR code the user scans into their authenticator app.
 *   3. User enters a 6-digit code to verify setup works.
 *   4. On success: encrypt + store the secret, generate + hash backup codes.
 *   5. On login: fetch encrypted secret from Firestore, decrypt, verify code.
 *
 * Encryption scheme:
 *   - Derive a 256-bit AES key via PBKDF2 (password = user UID, salt = random 16B)
 *   - Encrypt the base32 secret with AES-256-GCM (random 12B IV)
 *   - Store as: base64(salt + IV + ciphertext)
 *   - 100k PBKDF2 iterations (OWASP 2023 recommendation for JS)
 */

import * as OTPAuth from "otpauth";
import * as QRCode from "qrcode";

// ─── Constants ───

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const IV_BYTES = 12; // AES-GCM standard

// ─── Types ───

export interface TOTPSetupData {
  /** Base32-encoded secret (unencrypted, for setup only). */
  secret: string;
  /** The otpauth:// URI for QR code generation. */
  otpauthUri: string;
}

export interface TOTPStoredData {
  /** Encrypted base32 secret: base64(salt + IV + ciphertext). */
  secretEncrypted: string;
  /** Whether TOTP is enabled for this user. */
  enabled: boolean;
  /** SHA-256 hashes of backup codes. */
  backupCodeHashes: string[];
}

export interface TOTPVerificationResult {
  success: boolean;
  /** Index of the backup code used, if applicable (-1 for TOTP). */
  usedBackupIndex: number;
}

// ─── Setup — generate secret + build QR ───

/**
 * §2.3 — Generate a new TOTP secret and build the otpauth:// URI.
 */
export function generateTOTPSecret(email: string): TOTPSetupData {
  const secret = new OTPAuth.Secret({ size: 20 });
  const base32 = secret.base32;

  const totp = new OTPAuth.TOTP({
    issuer: "Duxo",
    label: email,
    secret: base32,
    digits: 6,
    period: 30,
  });

  const uri = totp.toString();

  return { secret: base32, otpauthUri: uri };
}

/**
 * Render the otpauth:// URI as an inline SVG QR code string.
 */
export async function generateQRCodeSVG(otpauthUri: string): Promise<string> {
  return await QRCode.toString(otpauthUri, {
    type: "svg",
    margin: 1,
    width: 200,
    color: {
      dark: "#ffffff",
      light: "#000000",
    },
  });
}

// ─── Verification ───

/**
 * §2.3 — Verify a 6-digit TOTP code against the stored (decrypted) secret.
 * Uses a 30-second window with 1 step tolerance (allows ±30s clock drift).
 */
export function verifyTOTPCode(secretBase32: string, token: string): boolean {
  try {
    const totp = new OTPAuth.TOTP({
      issuer: "Duxo",
      secret: secretBase32,
      digits: 6,
      period: 30,
    });

    // Validate with 1-step window tolerance (current ± 30s)
    const delta = totp.validate({ token, window: 1 });
    return delta !== null;
  } catch {
    return false;
  }
}

// ─── Encryption (Web Crypto API: AES-256-GCM + PBKDF2) ───

/**
 * Derive an AES-256-GCM key from the user's UID using PBKDF2.
 *
 * READ THIS BEFORE RELYING ON IT. The KDF password is the user's uid, and
 * the uid is the *document path* this ciphertext is stored at
 * (`users/{uid}`). An attacker who can read the document therefore already
 * holds the password, the salt and the IV, and can derive the key directly.
 * The 100k iterations slow an attacker who has to guess a password; this one
 * does not have to guess.
 *
 * So this is obfuscation at rest, not confidentiality against a Firestore
 * compromise. The previous comment here claimed the opposite — "an attacker
 * who compromises Firestore gets salt + ciphertext, not the UID" — which is
 * false in the one scenario the encryption exists for, and is the kind of
 * claim that stops anyone looking again.
 *
 * What it does still buy: a secret that leaks *without* its path is not
 * trivially readable — a log line, a partial backup, a screenshot of a
 * document body. That is worth having and is not nothing, but it is not the
 * threat model §2.3 implies.
 *
 * Making this real needs key material the client cannot hold: either a
 * server-held pepper with verification moved behind an API route, or a
 * user-supplied passphrase. Both are architecture decisions, not edits, and
 * are noted rather than made here. Nothing is deployed yet — Firebase is
 * unprovisioned — so there is no stored ciphertext to migrate when it is.
 *
 * 100k iterations is the OWASP 2023 minimum for PBKDF2-HMAC-SHA256 in JS.
 */
async function deriveKey(
  uid: string,
  // Uint8Array<ArrayBuffer>, not a bare Uint8Array: the default type parameter
  // is ArrayBufferLike, which admits SharedArrayBuffer, and WebCrypto's
  // BufferSource does not. Pinning it here is what lets the salt be passed
  // straight through as a view instead of being cast to an ArrayBuffer.
  salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  const uidBuffer = new TextEncoder().encode(uid);
  const baseKey = await crypto.subtle.importKey(
    "raw",
    uidBuffer,
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      // The Uint8Array itself, not `salt.buffer`. WebCrypto takes a
      // BufferSource (ArrayBuffer *or* view), and the two are not equally
      // safe to hand over: a bare ArrayBuffer is validated with `instanceof
      // ArrayBuffer`, which is realm-bound, while a view is validated by
      // internal slot and is not. Under jsdom the array comes from the jsdom
      // realm and `crypto.subtle` is Node's, so `.buffer` failed that check
      // with "'salt' of 'Pbkdf2Params' is not instance of ArrayBuffer" and
      // every encrypt/decrypt threw. It works in a browser, where there is
      // only one realm — which is why it survived: the function could not be
      // exercised from a test at all, so it never was.
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Encrypt the TOTP secret with AES-256-GCM using a PBKDF2-derived key.
 *
 * Storage format (single Base64 string):
 *   base64(salt (16B) + IV (12B) + ciphertext)
 *
 * The caller must store this string in Firestore as `totpSecretEncrypted`.
 */
export async function encryptSecret(
  secretBase32: string,
  uid: string,
): Promise<string> {
  // Generate random salt for PBKDF2
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  // Generate random IV for AES-GCM
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));

  // Derive the encryption key
  const key = await deriveKey(uid, salt);

  // Encrypt the secret
  const plaintext = new TextEncoder().encode(secretBase32);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      plaintext,
    ),
  );

  // Combine: salt + iv + ciphertext → single Base64 string
  const combined = new Uint8Array(SALT_BYTES + IV_BYTES + ciphertext.length);
  combined.set(salt, 0);
  combined.set(iv, SALT_BYTES);
  combined.set(ciphertext, SALT_BYTES + IV_BYTES);

  return base64Encode(combined);
}

/**
 * Decrypt the TOTP secret from the encrypted storage format.
 * Reverses `encryptSecret`: parse salt + IV + ciphertext, derive key, decrypt.
 */
export async function decryptSecret(
  encrypted: string,
  uid: string,
): Promise<string> {
  const combined = base64Decode(encrypted);

  if (combined.length < SALT_BYTES + IV_BYTES) {
    throw new Error("Invalid encrypted data: too short");
  }

  const salt = combined.slice(0, SALT_BYTES);
  const iv = combined.slice(SALT_BYTES, SALT_BYTES + IV_BYTES);
  const ciphertext = combined.slice(SALT_BYTES + IV_BYTES);

  // Derive the same key
  const key = await deriveKey(uid, salt);

  // Decrypt
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(plaintext);
}

// ─── Backup codes ───

/**
 * §8.5 — Generate 10 single-use backup codes.
 * Returns an array of { plaintext, hash } pairs.
 * Uses the Web Crypto API for SHA-256 hashing.
 *
 * The codes come from `crypto.getRandomValues`, not `Math.random`. A backup
 * code bypasses the second factor on its own, so it is an authentication
 * credential and has to be unguessable. `Math.random` is a plain PRNG —
 * V8's xorshift128+ — whose internal state can be recovered from a handful
 * of observed outputs, after which every other code in the batch is
 * derivable. Nominal entropy (8 chars over a 32-char alphabet, 40 bits)
 * counts for nothing if the generator is predictable, and this file was
 * already using getRandomValues two functions up for the PBKDF2 salt.
 *
 * The alphabet is exactly 32 characters, which divides 256 evenly, so
 * masking a byte to 5 bits is uniform — no modulo bias to reject for.
 */
const BACKUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export async function generateBackupCodes(): Promise<
  { plaintext: string; hash: string }[]
> {
  const codes: { plaintext: string; hash: string }[] = [];

  for (let i = 0; i < 10; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    let code = "";
    for (let j = 0; j < 8; j++) {
      code += BACKUP_CODE_ALPHABET[bytes[j] & 31];
    }
    const formatted = `${code.slice(0, 4)}-${code.slice(4)}`;
    const hash = await sha256(formatted);
    codes.push({ plaintext: formatted, hash });
  }

  return codes;
}

/**
 * §8.5 — Verify a backup code against stored SHA-256 hashes.
 * Returns the index of the used code so it can be removed from the list.
 */
export async function verifyBackupCode(
  code: string,
  storedHashes: string[],
): Promise<number> {
  const hash = await sha256(code.toUpperCase());
  return storedHashes.findIndex((h) => h === hash);
}

// ─── SHA-256 via Web Crypto API ───

/**
 * Compute a SHA-256 hash using the Web Crypto API.
 * Falls back only if SubtleCrypto is unavailable (virtually never in modern browsers).
 */
export async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Base64 helpers (browser-compatible) ───

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64Decode(str: string): Uint8Array<ArrayBuffer> {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
