import { describe, it, expect, beforeEach } from "vitest";
import {
  rememberChallenge,
  takeChallenge,
  relyingParty,
  __resetChallenges,
} from "@/lib/webauthn-server";

/**
 * §8.1 — the two decisions that make a WebAuthn ceremony mean anything, now
 * that verification is server-side.
 *
 * Neither existed before. The challenge was generated in the browser and
 * never checked, and there was no origin policy at all because nothing was
 * verified against one. A challenge that is not single-use, or an origin
 * allowlist that falls open, would quietly restore the old situation while
 * looking like it had been fixed.
 */

beforeEach(() => {
  __resetChallenges();
});

function req(origin?: string) {
  return new Request("http://localhost:3000/api/webauthn/options", {
    method: "POST",
    headers: origin ? { origin } : {},
  });
}

describe("challenge lifetime (§8.1)", () => {
  it("returns the challenge it was given", () => {
    rememberChallenge("user_1", "authenticate", "chal-abc");
    expect(takeChallenge("user_1", "authenticate")).toBe("chal-abc");
  });

  it("is single-use, so an assertion cannot be replayed", () => {
    // The property the whole route rests on. Without it, one captured
    // assertion authenticates forever inside the TTL.
    rememberChallenge("user_1", "authenticate", "chal-abc");
    expect(takeChallenge("user_1", "authenticate")).toBe("chal-abc");
    expect(takeChallenge("user_1", "authenticate")).toBeNull();
  });

  it("does not leak a challenge across users", () => {
    rememberChallenge("user_1", "authenticate", "chal-user1");
    expect(takeChallenge("user_2", "authenticate")).toBeNull();
    expect(takeChallenge("user_1", "authenticate")).toBe("chal-user1");
  });

  it("keeps registration and authentication ceremonies apart", () => {
    // A registration challenge must not complete an authentication: they
    // authorise different things.
    rememberChallenge("user_1", "register", "chal-reg");
    expect(takeChallenge("user_1", "authenticate")).toBeNull();
    expect(takeChallenge("user_1", "register")).toBe("chal-reg");
  });

  it("returns null for a ceremony that was never started", () => {
    expect(takeChallenge("nobody", "authenticate")).toBeNull();
  });

  it("replaces an outstanding challenge when a ceremony restarts", () => {
    rememberChallenge("user_1", "authenticate", "chal-first");
    rememberChallenge("user_1", "authenticate", "chal-second");
    expect(takeChallenge("user_1", "authenticate")).toBe("chal-second");
  });
});

describe("origin policy (§8.1)", () => {
  it("refuses a request with no Origin header", () => {
    // Verifying against an origin the request did not state would mean
    // verifying against nothing.
    expect(relyingParty(req())).toBeNull();
  });

  it("refuses a malformed Origin", () => {
    expect(relyingParty(req("not a url"))).toBeNull();
  });

  it("allows localhost in development and derives the rpID from it", () => {
    const rp = relyingParty(req("http://localhost:3000"));
    expect(rp).toEqual({ origin: "http://localhost:3000", rpID: "localhost" });
  });

  it("refuses an unrelated origin even when it looks similar", () => {
    // The near-miss cases: a lookalike host, and a subdomain of it.
    expect(relyingParty(req("https://localhost.evil.com"))).toBeNull();
    expect(relyingParty(req("https://duxo.app"))).toBeNull();
  });

  it("pins to NEXT_PUBLIC_SITE_URL once it is set", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://duxo.example.com";
    try {
      expect(relyingParty(req("https://duxo.example.com"))).toEqual({
        origin: "https://duxo.example.com",
        rpID: "duxo.example.com",
      });
      // Same host, different scheme or port is a different origin to
      // WebAuthn, and must be to us.
      expect(relyingParty(req("http://duxo.example.com"))).toBeNull();
      expect(relyingParty(req("https://duxo.example.com:8443"))).toBeNull();
      expect(relyingParty(req("https://attacker.example.com"))).toBeNull();
    } finally {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    }
  });

  it("does not fall open when NEXT_PUBLIC_SITE_URL is malformed", () => {
    // A bad config value must not widen the allowlist — it falls through to
    // the localhost rule, and nothing else.
    process.env.NEXT_PUBLIC_SITE_URL = "notaurl";
    try {
      expect(relyingParty(req("https://attacker.example.com"))).toBeNull();
      expect(relyingParty(req("http://localhost:3000"))).not.toBeNull();
    } finally {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    }
  });
});
