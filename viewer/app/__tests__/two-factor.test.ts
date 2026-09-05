import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  issueTwoFactorToken,
  verifyTwoFactorToken,
  twoFactorCookieOptions,
  TWO_FACTOR_TTL_SECONDS,
} from "@/lib/two-factor";

/**
 * §2.3 — the token that replaced `totpSessionFlag`.
 *
 * The old gate was a module-level boolean in the browser, set by the page that
 * was supposed to be gating, and read by nothing on the server. Requesting
 * /dashboard directly skipped it. So the properties worth pinning here are the
 * ones that make this a gate rather than a suggestion: it cannot be forged, it
 * cannot be moved between accounts, it expires, and every unverifiable form of
 * it is refused rather than given the benefit of the doubt.
 */

const UID = "user_2abcDEF";
const OTHER = "user_9zzzQQQ";
const KEY = "test-master-key-not-a-real-one-0123456789";

beforeEach(() => {
  process.env.TOTP_MASTER_KEY = KEY;
});

afterEach(() => {
  delete process.env.TOTP_MASTER_KEY;
});

describe("two-factor proof token (§2.3)", () => {
  it("verifies a token it just issued", async () => {
    const token = await issueTwoFactorToken(UID);
    expect(token).toBeTruthy();
    await expect(verifyTwoFactorToken(token!, UID)).resolves.toBe(true);
  });

  it("refuses a token issued for another user", async () => {
    // Binding to the uid is what stops one account's proof being pasted into
    // another's cookie jar.
    const token = await issueTwoFactorToken(UID);
    await expect(verifyTwoFactorToken(token!, OTHER)).resolves.toBe(false);
  });

  it("refuses a token whose payload was edited", async () => {
    // The whole point: a client that can see the cookie still cannot change
    // the uid or push the expiry out, because the signature covers both.
    const token = await issueTwoFactorToken(UID);
    const [uid, exp, sig] = token!.split(".");
    expect(uid).toBe(UID);

    await expect(verifyTwoFactorToken(`${OTHER}.${exp}.${sig}`, OTHER)).resolves.toBe(false);
    const later = Number(exp) + 86_400;
    await expect(verifyTwoFactorToken(`${uid}.${later}.${sig}`, UID)).resolves.toBe(false);
  });

  it("refuses a token with a corrupted signature", async () => {
    const token = await issueTwoFactorToken(UID);
    const cut = token!.lastIndexOf(".");
    const tampered = `${token!.slice(0, cut)}.${"A".repeat(token!.length - cut - 1)}`;
    await expect(verifyTwoFactorToken(tampered, UID)).resolves.toBe(false);
  });

  it("refuses an expired token", async () => {
    // Expiry lives inside the signed payload, not in the cookie's Max-Age —
    // Max-Age is a client-side hint and the client is what we are defending
    // against.
    const past = Math.floor(Date.now() / 1000) - 60;
    await expect(verifyTwoFactorToken(`${UID}.${past}.anything`, UID)).resolves.toBe(false);
  });

  it("refuses missing and malformed tokens", async () => {
    for (const bad of [undefined, "", "nodots", `${UID}.notanumber.sig`, ".", ".."]) {
      await expect(verifyTwoFactorToken(bad as string | undefined, UID)).resolves.toBe(
        false,
      );
    }
  });

  it("refuses a token signed with a different master key", async () => {
    const token = await issueTwoFactorToken(UID);
    process.env.TOTP_MASTER_KEY = "an-entirely-different-master-key-value";
    await expect(verifyTwoFactorToken(token!, UID)).resolves.toBe(false);
  });

  it("issues nothing and verifies nothing when unconfigured", async () => {
    // Fail closed. `issue` returning null must not be read as "passed", and
    // `verify` must not pass anything through when it cannot check.
    const token = await issueTwoFactorToken(UID);
    delete process.env.TOTP_MASTER_KEY;
    await expect(issueTwoFactorToken(UID)).resolves.toBeNull();
    await expect(verifyTwoFactorToken(token!, UID)).resolves.toBe(false);
  });
});

describe("proof cookie attributes (§2.3)", () => {
  it("is HttpOnly and same-site, so the page cannot read or send it cross-site", () => {
    const opts = twoFactorCookieOptions(TWO_FACTOR_TTL_SECONDS);
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.path).toBe("/");
    expect(opts.maxAge).toBe(TWO_FACTOR_TTL_SECONDS);
  });

  it("is Secure in production", () => {
    const original = process.env.NODE_ENV;
    try {
      // NODE_ENV is readonly in the Next types but writable at runtime; the
      // cast keeps the assertion honest rather than skipping it.
      (process.env as Record<string, string>).NODE_ENV = "production";
      expect(twoFactorCookieOptions(60).secure).toBe(true);
    } finally {
      (process.env as Record<string, string>).NODE_ENV = original as string;
    }
  });
});
