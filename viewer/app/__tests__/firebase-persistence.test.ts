import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * §2.5 — the Firebase session must live in memory and nowhere else.
 *
 * This is asserted rather than assumed because nothing was enforcing it. The
 * module that actually signs users in (firebase-client, via auth-bridge)
 * built its auth with plain `getAuth`, which applies Firebase's default
 * persistence — `browserLocalPersistence`, i.e. localStorage. Every
 * `signInWithCustomToken` therefore wrote a Firebase refresh token to disk,
 * where it outlived the tab and was readable by anything that achieved
 * script execution on the origin.
 *
 * The second copy of the module (lib/firebase.ts, used by webauthn) tried to
 * do better and got it wrong in a different way: `setPersistence(...)` is
 * async and was called fire-and-forget, so a sign-in could race ahead of it,
 * and its own failure path fell back to `browserLocalPersistence` — the
 * exact store its file header forbids.
 *
 * What matters is the mechanism, not the intent: persistence has to be
 * passed to `initializeAuth` at construction, so there is no window in which
 * the wrong store is active. These tests pin that.
 */

const initializeAuth = vi.fn(() => ({ __tag: "auth-instance" }));
const getAuth = vi.fn(() => ({ __tag: "auth-fallback" }));

vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(() => ({ __tag: "app" })),
  getApps: vi.fn(() => []),
}));
vi.mock("firebase/auth", () => ({
  initializeAuth: (...args: unknown[]) => initializeAuth(...(args as [])),
  getAuth: (...args: unknown[]) => getAuth(...(args as [])),
  inMemoryPersistence: { __tag: "inMemoryPersistence" },
  browserLocalPersistence: { __tag: "browserLocalPersistence" },
  browserSessionPersistence: { __tag: "browserSessionPersistence" },
  signInWithCustomToken: vi.fn(),
}));
vi.mock("firebase/database", () => ({ getDatabase: vi.fn(() => ({})) }));
vi.mock("firebase/firestore", () => ({ getFirestore: vi.fn(() => ({})) }));

async function freshClient() {
  vi.resetModules();
  return await import("@/lib/firebase-client");
}

describe("Firebase auth persistence (§2.5)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "test-key");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "demo-duxo");
    initializeAuth.mockClear().mockReturnValue({ __tag: "auth-instance" });
    getAuth.mockClear().mockReturnValue({ __tag: "auth-fallback" });
  });

  it("pins persistence to memory at construction, not afterwards", async () => {
    const { getFirebaseClient } = await freshClient();
    getFirebaseClient();

    expect(initializeAuth).toHaveBeenCalledTimes(1);
    const [, options] = initializeAuth.mock.calls[0] as unknown as [
      unknown,
      { persistence: { __tag: string } },
    ];
    expect(options.persistence).toEqual({ __tag: "inMemoryPersistence" });
  });

  it("never constructs auth with a browser storage persistence", async () => {
    // The two stores that must never hold a Duxo refresh token. localStorage
    // is what plain getAuth defaults to and what the old fallback path
    // explicitly selected.
    const { getFirebaseClient } = await freshClient();
    getFirebaseClient();

    const serialised = JSON.stringify(initializeAuth.mock.calls);
    expect(serialised).not.toContain("browserLocalPersistence");
    expect(serialised).not.toContain("browserSessionPersistence");
  });

  it("does not fall back to getAuth's default persistence on the happy path", async () => {
    // getAuth is reached only when initializeAuth throws already-initialized.
    // Reaching it routinely would silently restore localStorage.
    const { getFirebaseClient } = await freshClient();
    getFirebaseClient();
    expect(getAuth).not.toHaveBeenCalled();
  });

  it("reuses the configured instance when auth was already initialised", async () => {
    // A second module touching the same app must not get a differently
    // configured auth — that is how the codebase ended up with two.
    initializeAuth.mockImplementation(() => {
      throw new Error("auth/already-initialized");
    });
    const { getFirebaseClient } = await freshClient();
    const client = getFirebaseClient();

    expect(getAuth).toHaveBeenCalledTimes(1);
    expect(client?.auth).toEqual({ __tag: "auth-fallback" });
  });

  it("hands auth-bridge and the webauthn alias the same instance", async () => {
    // lib/firebase.ts was a second copy with its own app and its own
    // persistence handling. Both entry points must now resolve to one auth.
    vi.resetModules();
    const { getFirebaseClient } = await import("@/lib/firebase-client");
    const { getFirebase } = await import("@/lib/firebase");

    expect(getFirebase()?.auth).toBe(getFirebaseClient()?.auth);
  });

  it("returns null instead of an app when config is absent", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "");
    const { getFirebaseClient } = await freshClient();
    expect(getFirebaseClient()).toBeNull();
    expect(initializeAuth).not.toHaveBeenCalled();
  });
});
