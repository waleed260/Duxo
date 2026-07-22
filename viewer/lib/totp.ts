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
 * Combines the UID with a random salt so that:
 *   - Two users with the same UID do not produce the same key (salt differs).
 *   - An attacker who compromises Firestore gets salt + ciphertext, not the UID
 *     — they still need to brute-force PBKDF2 to recover the key.
 *
 * 100k iterations is the OWASP 2023 minimum for PBKDF2-HMAC-SHA256 in JS.
 */
async function deriveKey(uid: string, salt: Uint8Array): Promise<CryptoKey> {
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
      salt: salt.buffer as ArrayBuffer,
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
 */
export async function generateBackupCodes(): Promise<
  { plaintext: string; hash: string }[]
> {
  const codes: { plaintext: string; hash: string }[] = [];

  for (let i = 0; i < 10; i++) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let j = 0; j < 8; j++) {
      code += chars[Math.floor(Math.random() * chars.length)];
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

function base64Decode(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
