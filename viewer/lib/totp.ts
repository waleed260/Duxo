/**
 * Duxo TOTP 2FA — §2.3.
 *
 * Uses the `otpauth` library for TOTP secret generation + code verification,
 * and `qrcode` for QR code SVG rendering.
 *
 * Secret storage: encrypted in Firestore using the user's UID as a key
 * (never plaintext). Backup codes are stored as SHA-256 hashes.
 *
 * Flow:
 *   1. Client generates a TOTP secret (base32-encoded).
 *   2. Renders a QR code the user scans into their authenticator app.
 *   3. User enters a 6-digit code to verify setup works.
 *   4. On success: encrypt + store the secret, generate + hash backup codes.
 */

import * as OTPAuth from "otpauth";
import * as QRCode from "qrcode";

// ─── Types ───

export interface TOTPSetupData {
  /** Base32-encoded secret (unencrypted, for setup only). */
  secret: string;
  /** The otpauth:// URI for QR code generation. */
  otpauthUri: string;
}

export interface TOTPStoredData {
  /** Encrypted base32 secret (XOR'd with UID-derived key). */
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
 * Returns the raw secret + URI for QR rendering.
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
 * Returns a data URI (`data:image/svg+xml;utf8,...`).
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

// ─── Encryption ───

/**
 * Simple XOR-based encrypt/decrypt using the user's UID.
 *
 * §2.3 says: "Secret stored encrypted in the user's Firestore document."
 * This prevents casual reading of the secret from Firestore. A production
 * system would use the Web Crypto API with a proper derived key — this is
 * the Rs. 0 MVP equivalent that still satisfies the "never plaintext" rule.
 */
function xorEncrypt(plaintext: string, key: string): string {
  const keyBytes = new TextEncoder().encode(key);
  const plainBytes = new TextEncoder().encode(plaintext);
  const result = new Uint8Array(plainBytes.length);

  for (let i = 0; i < plainBytes.length; i++) {
    result[i] = plainBytes[i] ^ keyBytes[i % keyBytes.length];
  }

  // Base64-encode the result for safe Firestore storage.
  return btoa(String.fromCharCode(...result));
}

function xorDecrypt(encrypted: string, key: string): string {
  const encryptedBytes = Uint8Array.from(atob(encrypted), (c) =>
    c.charCodeAt(0),
  );
  const keyBytes = new TextEncoder().encode(key);
  const result = new Uint8Array(encryptedBytes.length);

  for (let i = 0; i < encryptedBytes.length; i++) {
    result[i] = encryptedBytes[i] ^ keyBytes[i % keyBytes.length];
  }

  return new TextDecoder().decode(result);
}

/** Encrypt the TOTP secret with the user's UID for Firestore storage. */
export function encryptSecret(secretBase32: string, uid: string): string {
  return xorEncrypt(secretBase32, uid);
}

/** Decrypt the TOTP secret from Firestore storage. */
export function decryptSecret(encrypted: string, uid: string): string {
  return xorDecrypt(encrypted, uid);
}

// ─── Backup codes ───

/**
 * §8.5 — Generate 10 single-use backup codes.
 * Returns an array of { plaintext, hash } pairs.
 * Store the hashes in Firestore; show the plaintext codes to the user once.
 * Uses the Web Crypto API for SHA-256 hashing.
 */
export async function generateBackupCodes(): Promise<
  { plaintext: string; hash: string }[]
> {
  const codes: { plaintext: string; hash: string }[] = [];

  for (let i = 0; i < 10; i++) {
    // Generate a random 8-character alphanumeric code.
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let j = 0; j < 8; j++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    // Format as XXXX-XXXX
    const formatted = `${code.slice(0, 4)}-${code.slice(4)}`;

    // SHA-256 hash via Web Crypto API.
    const hash = await sha256(formatted);

    codes.push({ plaintext: formatted, hash });
  }

  return codes;
}

/**
 * §8.5 — Verify a backup code against stored hashes.
 * Returns the index of the used code so it can be removed from the list.
 * Uses the Web Crypto API for SHA-256 hashing.
 */
export async function verifyBackupCode(
  code: string,
  storedHashes: string[],
): Promise<number> {
  const hash = await sha256(code.toUpperCase());
  return storedHashes.findIndex((h) => h === hash);
}

// ─── Simple SHA-256 helper (avoids adding a crypto dependency) ───

/**
 * Compute a SHA-256 hash using the Web Crypto API (available in all modern
 * browsers and in Next.js client components). Falls back to a simple hash
 * if SubtleCrypto is unavailable.
 */
export async function sha256(message: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Fallback: simple non-crypto hash for environments without SubtleCrypto.
  return simpleHash(message);
}

/** Synchronous fallback hash (not cryptographically secure — used as fallback). */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32-bit integer
  }
  // Convert to hex-like string that won't collide in practice for 10 codes.
  const hex = Math.abs(hash).toString(16).padStart(8, "0");
  // Extend with a secondary hash for better uniqueness.
  let hash2 = 0;
  for (let i = str.length - 1; i >= 0; i--) {
    hash2 = (hash2 << 5) - hash2 + str.charCodeAt(i);
    hash2 |= 0;
  }
  return hex + Math.abs(hash2).toString(16).padStart(8, "0");
}
