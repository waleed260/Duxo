import { describe, it, expect, vi } from "vitest";
import {
  generateTOTPSecret,
  verifyTOTPCode,
  generateBackupCodes,
  verifyBackupCode,
} from "@/lib/totp";

/**
 * §2.3 / §8.5 — the second factor. Untested until now, which is a poor place
 * for a gap: every function here is a credential operation, and two of them
 * were wrong.
 *
 * Backup codes were drawn from `Math.random`. A backup code bypasses the
 * second factor by itself, so it is an authentication credential; V8's
 * xorshift128+ can be reconstructed from a few outputs, and the remaining
 * codes in the batch then follow. Nominal entropy is irrelevant against a
 * predictable generator.
 *
 * Encryption is no longer here at all. It moved to lib/totp-server.ts, keyed
 * by a master secret the browser never sees, and is covered by
 * totp-server.test.ts. What remains in this file is the pure half that runs
 * anywhere and needs no environment: secret generation, code verification,
 * and the backup codes.
 */

describe("TOTP secret generation (§2.3)", () => {
  it("produces a base32 secret and a scannable otpauth URI", () => {
    const { secret, otpauthUri } = generateTOTPSecret("someone@example.com");
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(otpauthUri.startsWith("otpauth://totp/")).toBe(true);
    expect(otpauthUri).toContain("Duxo");
  });

  it("never repeats a secret across calls", () => {
    const seen = new Set(
      Array.from({ length: 25 }, () => generateTOTPSecret("a@b.c").secret),
    );
    expect(seen.size).toBe(25);
  });
});

describe("TOTP verification (§2.3)", () => {
  it("rejects a wrong code and a malformed secret without throwing", () => {
    const { secret } = generateTOTPSecret("a@b.c");
    expect(verifyTOTPCode(secret, "000000")).toBe(false);
    expect(verifyTOTPCode(secret, "not-a-code")).toBe(false);
    expect(verifyTOTPCode("!!!not-base32!!!", "123456")).toBe(false);
  });
});

describe("backup codes (§8.5)", () => {
  it("does not draw from Math.random", async () => {
    // The actual defect. Math.random is a plain PRNG whose state is
    // recoverable from its outputs, so one leaked batch predicts the rest.
    //
    // Asserted by pinning Math.random rather than by spying on
    // crypto.getRandomValues: `crypto` is a lazily-defined global whose
    // properties are not reliably configurable across Node versions, so
    // spying on it passed on Node 24 and failed the suite on the Node 20 the
    // .nvmrc pins. Math.random is a plain writable global everywhere.
    //
    // Frozen to 0, the old implementation emitted "AAAA-AAAA" ten times over,
    // since every index became the alphabet's first entry.
    const mathRandom = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const codes = await generateBackupCodes();
      expect(codes.map((c) => c.plaintext)).not.toContain("AAAA-AAAA");
      expect(new Set(codes.map((c) => c.plaintext)).size).toBe(10);
    } finally {
      mathRandom.mockRestore();
    }
  });

  it("issues ten formatted codes over the unambiguous alphabet", async () => {
    const codes = await generateBackupCodes();
    expect(codes).toHaveLength(10);
    for (const { plaintext } of codes) {
      // No O/0 or I/1/L — these get read off a screen and typed.
      expect(plaintext).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
    }
  });

  it("stores only hashes, never the code itself", async () => {
    const codes = await generateBackupCodes();
    for (const { plaintext, hash } of codes) {
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(hash).not.toContain(plaintext.replace("-", ""));
    }
  });

  it("does not repeat a code within or across batches", async () => {
    const batches = await Promise.all([
      generateBackupCodes(),
      generateBackupCodes(),
      generateBackupCodes(),
    ]);
    const all = batches.flat().map((c) => c.plaintext);
    expect(new Set(all).size).toBe(all.length);
  });

  it("matches a stored code case-insensitively and reports its index", async () => {
    const codes = await generateBackupCodes();
    const hashes = codes.map((c) => c.hash);
    await expect(verifyBackupCode(codes[3].plaintext, hashes)).resolves.toBe(3);
    await expect(
      verifyBackupCode(codes[3].plaintext.toLowerCase(), hashes),
    ).resolves.toBe(3);
  });

  it("returns -1 for a code that was never issued", async () => {
    const codes = await generateBackupCodes();
    await expect(
      verifyBackupCode("ZZZZ-9999", codes.map((c) => c.hash)),
    ).resolves.toBe(-1);
    await expect(verifyBackupCode("anything", [])).resolves.toBe(-1);
  });
});
