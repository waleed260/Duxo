import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * The health route's whole value is telling a misconfigured deploy from a
 * working one, so the cases that matter are the misconfigured ones — and the
 * guarantee that it never hands a secret back while doing it.
 */

const ALL = {
  CLERK_SECRET_KEY: "sk_test_secretvalue",
  FIREBASE_PROJECT_ID: "duxo-test",
  FIREBASE_CLIENT_EMAIL: "sa@duxo-test.iam.gserviceaccount.com",
  FIREBASE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----AAAA-----END PRIVATE KEY-----",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x",
  NEXT_PUBLIC_FIREBASE_API_KEY: "AIzaSyTest",
  NEXT_PUBLIC_FIREBASE_DATABASE_URL: "https://duxo-test.firebaseio.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "duxo-test",
  NEXT_PUBLIC_METERED_TURN_URLS: "turn:turn.metered.ca:80",
  // Deliberately distinctive: a one-character fixture would appear inside
  // words like "status" and make the leak assertion below fail for a reason
  // that has nothing to do with the route.
  NEXT_PUBLIC_METERED_TURN_USERNAME: "turnuser_fixture",
  NEXT_PUBLIC_METERED_TURN_CREDENTIAL: "turnpass_fixture",
};

async function callHealth(env: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.resetModules();
  const { GET } = await import("@/app/api/health/route");
  const res = await GET();
  return { res, body: await res.json() };
}

describe("GET /api/health", () => {
  let saved: NodeJS.ProcessEnv;
  beforeEach(() => {
    saved = { ...process.env };
  });
  afterEach(() => {
    process.env = saved;
  });

  it("reports ok when everything is set", async () => {
    const { res, body } = await callHealth(ALL);
    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.turnConfigured).toBe(true);
  });

  it("answers 503, not 200, when server config is missing", async () => {
    // A misconfigured deploy reading as healthy to an uptime check is the
    // failure this endpoint exists to prevent.
    const { res, body } = await callHealth({
      ...ALL,
      FIREBASE_PRIVATE_KEY: undefined,
    });
    expect(res.status).toBe(503);
    expect(body.status).toBe("misconfigured");
    expect(body.missing.server).toContain("FIREBASE_PRIVATE_KEY");
  });

  it("treats an empty string as missing", async () => {
    // Railway persists a variable set to "" — present but useless.
    const { res } = await callHealth({ ...ALL, CLERK_SECRET_KEY: "   " });
    expect(res.status).toBe(503);
  });

  it("stays healthy without TURN but flags it (§0.8)", async () => {
    // Missing TURN is "up, and broken for some callers" — a different answer
    // from misconfigured, and it must not take the deploy down.
    const { res, body } = await callHealth({
      ...ALL,
      NEXT_PUBLIC_METERED_TURN_CREDENTIAL: undefined,
    });
    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.turnConfigured).toBe(false);
    expect(body.missing.turn).toContain("NEXT_PUBLIC_METERED_TURN_CREDENTIAL");
  });

  it("never returns a secret, or any part of one", async () => {
    const { body } = await callHealth(ALL);
    const text = JSON.stringify(body);
    for (const value of Object.values(ALL)) {
      expect(text).not.toContain(value);
    }
    // Not even a prefix long enough to be useful.
    expect(text).not.toContain("sk_test");
    expect(text).not.toContain("BEGIN PRIVATE KEY");
  });

  it("is never cached", async () => {
    const { res } = await callHealth(ALL);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
