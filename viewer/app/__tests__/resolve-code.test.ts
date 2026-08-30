import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * §0.7 / §4.4 — the code lookup is the front door to every session, and §4.4
 * is explicit that a control is not done until it has been tested to *fail*
 * correctly. So these are almost all failure paths: unauthenticated, rate
 * limited, malformed, and unknown-code.
 *
 * The route is the only thing standing between a signed-in account and the
 * 8-digit space, now that `codes/` is unreadable from the browser.
 */

const clerkAuth = vi.fn();
const dbGet = vi.fn();
const dbRef = vi.fn(() => ({ get: dbGet }));

vi.mock("@clerk/nextjs/server", () => ({ auth: () => clerkAuth() }));
vi.mock("firebase-admin/database", () => ({
  getDatabase: () => ({ ref: dbRef }),
}));
vi.mock("@/lib/firebase-admin", () => ({ firebaseAdmin: {} }));

function post(body: unknown) {
  return new Request("http://localhost/api/resolve-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function freshRoute() {
  // The limiter is module-level state, so each test needs its own instance or
  // the counts leak between them.
  vi.resetModules();
  return (await import("@/app/api/resolve-code/route")).POST;
}

describe("POST /api/resolve-code", () => {
  beforeEach(() => {
    clerkAuth.mockReturnValue({ userId: "user_1" });
    dbGet.mockReset();
    dbRef.mockClear();
  });

  it("refuses an unauthenticated caller", async () => {
    clerkAuth.mockReturnValue({ userId: null });
    const POST = await freshRoute();
    const res = await POST(post({ code: "12345678" }));
    expect(res.status).toBe(401);
    // It must not have reached the database at all.
    expect(dbRef).not.toHaveBeenCalled();
  });

  it("resolves a valid code to its session id", async () => {
    dbGet.mockResolvedValue({
      exists: () => true,
      val: () => ({ sessionId: "sess_abc", hostId: "host_1" }),
    });
    const POST = await freshRoute();
    const res = await POST(post({ code: "12345678" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ sessionId: "sess_abc" });
  });

  it("never returns hostId to the caller", async () => {
    dbGet.mockResolvedValue({
      exists: () => true,
      val: () => ({ sessionId: "sess_abc", hostId: "host_secret" }),
    });
    const POST = await freshRoute();
    const body = await (await POST(post({ code: "12345678" }))).text();
    expect(body).not.toContain("host_secret");
  });

  it("accepts the grouped display form the user actually sees", async () => {
    dbGet.mockResolvedValue({
      exists: () => true,
      val: () => ({ sessionId: "sess_abc", hostId: "h" }),
    });
    const POST = await freshRoute();
    const res = await POST(post({ code: "1234 5678" }));
    expect(res.status).toBe(200);
  });

  it("rejects anything that is not 8 digits without touching the database", async () => {
    const POST = await freshRoute();
    for (const code of ["1234567", "123456789", "abcdefgh", "", "1234-567"]) {
      const res = await POST(post({ code }));
      expect(res.status, `code ${code}`).toBe(400);
    }
    expect(dbRef).not.toHaveBeenCalled();
  });

  it("reports an unknown code and a malformed node identically", async () => {
    const POST = await freshRoute();

    dbGet.mockResolvedValueOnce({ exists: () => false, val: () => null });
    const missing = await POST(post({ code: "11111111" }));

    // A node that exists but carries no usable sessionId must not be
    // distinguishable from one that does not exist — telling them apart is
    // exactly the oracle an enumerator wants.
    dbGet.mockResolvedValueOnce({ exists: () => true, val: () => ({}) });
    const malformed = await POST(post({ code: "22222222" }));

    expect(missing.status).toBe(404);
    expect(malformed.status).toBe(404);
    expect(await missing.text()).toBe(await malformed.text());
  });

  it("stops a caller after 5 attempts in the window (§0.7)", async () => {
    dbGet.mockResolvedValue({ exists: () => false, val: () => null });
    const POST = await freshRoute();

    for (let i = 0; i < 5; i++) {
      const res = await POST(post({ code: "12345678" }));
      expect(res.status, `attempt ${i + 1}`).toBe(404);
    }

    const blocked = await POST(post({ code: "12345678" }));
    expect(blocked.status).toBe(429);
  });

  it("counts a malformed attempt against the limit too", async () => {
    const POST = await freshRoute();
    // Otherwise the cheapest way to probe is to alternate a bad code with a
    // real guess and never be counted for the guesses.
    for (let i = 0; i < 5; i++) {
      await POST(post({ code: "nope" }));
    }
    const blocked = await POST(post({ code: "12345678" }));
    expect(blocked.status).toBe(429);
  });

  it("limits each caller separately", async () => {
    dbGet.mockResolvedValue({ exists: () => false, val: () => null });
    const POST = await freshRoute();

    for (let i = 0; i < 5; i++) await POST(post({ code: "12345678" }));
    expect((await POST(post({ code: "12345678" }))).status).toBe(429);

    clerkAuth.mockReturnValue({ userId: "user_2" });
    expect((await POST(post({ code: "12345678" }))).status).toBe(404);
  });
});
