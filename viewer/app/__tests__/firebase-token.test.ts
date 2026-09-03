import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * §2.5 — this route mints the token the host verifies and then shows to the
 * user in the Allow/Deny dialog. The claims it sets are the only thing that
 * dialog can identify a viewer by, so what it puts in them is a security
 * property, not a detail.
 */

const clerkAuth = vi.fn();
const clerkCurrentUser = vi.fn();
const createCustomToken = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => Promise.resolve(clerkAuth()),
  currentUser: () => clerkCurrentUser(),
}));
vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({ createCustomToken }),
}));
vi.mock("@/lib/firebase-admin", () => ({ getFirebaseAdmin: () => ({}) }));

function userWith(email: string | null, status: string) {
  if (email === null) return { emailAddresses: [], primaryEmailAddressId: null };
  return {
    primaryEmailAddressId: "eml_1",
    emailAddresses: [
      { id: "eml_1", emailAddress: email, verification: { status } },
    ],
  };
}

async function post() {
  vi.resetModules();
  const { POST } = await import("@/app/api/firebase-token/route");
  return POST();
}

describe("POST /api/firebase-token", () => {
  beforeEach(() => {
    clerkAuth.mockReturnValue({ userId: "user_abc" });
    clerkCurrentUser.mockResolvedValue(userWith("a@example.com", "verified"));
    createCustomToken.mockReset().mockResolvedValue("minted-token");
  });

  it("refuses an unauthenticated caller before minting anything", async () => {
    clerkAuth.mockReturnValue({ userId: null });
    const res = await post();
    expect(res.status).toBe(401);
    expect(createCustomToken).not.toHaveBeenCalled();
  });

  it("mints for the Clerk uid, never for anything in the request", async () => {
    // The uid is what makes `hostId == auth.uid` in the RTDB rules hold.
    await post();
    expect(createCustomToken).toHaveBeenCalledWith("user_abc", expect.anything());
  });

  it("carries the email, without which the host rejects every viewer", async () => {
    // A custom token holds only the claims set here. When this was omitted,
    // the host's VerifiedClaims failed to deserialise on the missing field
    // and the failure surfaced as an invalid signature.
    await post();
    const [, claims] = createCustomToken.mock.calls[0];
    expect(claims.email).toBe("a@example.com");
    expect(claims.email_verified).toBe(true);
  });

  it("reports an unconfirmed address as unverified", async () => {
    // The dialog warns on this, so it has to be accurate — claiming verified
    // for an unconfirmed address is worse than sending nothing.
    clerkCurrentUser.mockResolvedValue(userWith("b@example.com", "unverified"));
    await post();
    const [, claims] = createCustomToken.mock.calls[0];
    expect(claims.email).toBe("b@example.com");
    expect(claims.email_verified).toBe(false);
  });

  it("still mints when Clerk exposes no email", async () => {
    // Degrades to an unidentified viewer the host can still deny, rather
    // than failing sign-in outright.
    clerkCurrentUser.mockResolvedValue(userWith(null, ""));
    const res = await post();
    expect(res.status).toBe(200);
    const [, claims] = createCustomToken.mock.calls[0];
    expect(claims.email).toBeUndefined();
  });

  it("never sets a reserved claim Firebase would refuse", async () => {
    // createCustomToken throws if developer claims collide with these, which
    // would take down sign-in for everyone.
    await post();
    const [, claims] = createCustomToken.mock.calls[0];
    for (const reserved of ["sub", "aud", "iss", "iat", "exp", "auth_time", "firebase"]) {
      expect(claims).not.toHaveProperty(reserved);
    }
  });
});
