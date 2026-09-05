import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  encryptSecret,
  decryptSecret,
  isTotpConfigured,
  TotpKeyUnavailableError,
} from "@/lib/totp-server";
import { rememberPendingSecret, takePendingSecret, __resetPending } from "@/lib/totp-pending";

/**
 * §2.3 — the property the old scheme did not have.
 *
 * Encryption used to run PBKDF2 with the user's uid as the password, and the
 * ciphertext was stored at `users/{uid}` — so the password was the document
 * path. A Firestore read yielded every input needed to derive the key. These
 * tests are mostly about the one thing that changed: the key now comes from a
 * server-only master secret, and nothing reachable from the stored document
 * reproduces it.
 */

const UID = "user_2abcDEF";
const OTHER = "user_9zzzQQQ";
const KEY = "test-master-key-not-a-real-one-0123456789";

beforeEach(() => {
  process.env.TOTP_MASTER_KEY = KEY;
  __resetPending();
});

afterEach(() => {
  delete process.env.TOTP_MASTER_KEY;
});

describe("secret encryption (§2.3)", () => {
  it("round-trips a secret", () => {
    const enc = encryptSecret("JBSWY3DPEHPK3PXP", UID);
    expect(enc).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptSecret(enc, UID)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("produces fresh ciphertext each time", () => {
    // Random salt and IV per call. Identical output would leak that two users
    // share a secret, and reusing an IV under one key breaks AES-GCM outright.
    const a = encryptSecret("JBSWY3DPEHPK3PXP", UID);
    const b = encryptSecret("JBSWY3DPEHPK3PXP", UID);
    expect(a).not.toBe(b);
  });

  it("will not decrypt under another uid", () => {
    // The uid stays in the derivation as HKDF `info`, so it still separates
    // users — it is just no longer the secret.
    const enc = encryptSecret("JBSWY3DPEHPK3PXP", UID);
    expect(() => decryptSecret(enc, OTHER)).toThrow();
  });

  it("will not decrypt under a different master key", () => {
    // The actual fix, stated as a test: the uid alone is no longer enough.
    // Someone holding the document — path included — still cannot read it.
    const enc = encryptSecret("JBSWY3DPEHPK3PXP", UID);
    process.env.TOTP_MASTER_KEY = "a-completely-different-master-key-value";
    expect(() => decryptSecret(enc, UID)).toThrow();
  });

  it("rejects tampered ciphertext rather than returning noise", () => {
    // AES-GCM's tag check. Without it a flipped byte decrypts to garbage that
    // a TOTP comparison would silently reject, hiding the tampering.
    const enc = encryptSecret("JBSWY3DPEHPK3PXP", UID);
    const buf = Buffer.from(enc, "base64");
    buf[buf.length - 1] ^= 0xff;
    expect(() => decryptSecret(buf.toString("base64"), UID)).toThrow();
  });

  it("rejects truncated input", () => {
    expect(() => decryptSecret(Buffer.from("short").toString("base64"), UID)).toThrow(
      /too short/i,
    );
  });

  it("fails closed with no master key, rather than falling back", () => {
    // A weaker fallback would be invisible: enrolment would appear to work and
    // the secret would be recoverable from the database alone, which is the
    // exact situation this replaced.
    delete process.env.TOTP_MASTER_KEY;
    expect(isTotpConfigured()).toBe(false);
    expect(() => encryptSecret("JBSWY3DPEHPK3PXP", UID)).toThrow(TotpKeyUnavailableError);
  });

  it("treats a too-short master key as unconfigured", () => {
    process.env.TOTP_MASTER_KEY = "short";
    expect(isTotpConfigured()).toBe(false);
    expect(() => encryptSecret("JBSWY3DPEHPK3PXP", UID)).toThrow(TotpKeyUnavailableError);
  });
});

describe("pending enrolment secrets (§2.3)", () => {
  it("returns the secret once and then forgets it", () => {
    // Single-use: a failed activation restarts enrolment rather than allowing
    // repeated guesses against one pending secret.
    rememberPendingSecret(UID, "JBSWY3DPEHPK3PXP");
    expect(takePendingSecret(UID)).toBe("JBSWY3DPEHPK3PXP");
    expect(takePendingSecret(UID)).toBeNull();
  });

  it("does not hand one user's pending secret to another", () => {
    rememberPendingSecret(UID, "JBSWY3DPEHPK3PXP");
    expect(takePendingSecret(OTHER)).toBeNull();
  });

  it("returns null when enrolment was never started", () => {
    expect(takePendingSecret("nobody")).toBeNull();
  });

  it("replaces the pending secret when enrolment restarts", () => {
    rememberPendingSecret(UID, "FIRSTSECRET23456");
    rememberPendingSecret(UID, "SECONDSECRET7890");
    expect(takePendingSecret(UID)).toBe("SECONDSECRET7890");
  });
});
