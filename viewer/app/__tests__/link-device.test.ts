import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * §2.1 / §8.2 — device pairing is the only way the host agent ever obtains a
 * credential, and this route is the half that holds the service-account key.
 * Two properties matter more than the happy path:
 *
 *   1. The custom token is minted for the *caller's* uid, never for anything
 *      in the request body. That is what makes `hostId == auth.uid` in §10.2
 *      mean anything at all.
 *   2. A pairing that succeeds shows up in the device registry. It did not
 *      before — nothing ever wrote `devices/{id}`, so /settings said "No
 *      devices registered" to someone who had just linked a machine.
 */

const clerkAuth = vi.fn();
const dbGet = vi.fn();
const dbUpdate = vi.fn();
const dbRemove = vi.fn();
const dbRef = vi.fn(() => ({
  get: dbGet,
  update: dbUpdate,
  remove: dbRemove,
}));
const createCustomToken = vi.fn();
const collectionAdd = vi.fn();
const collection = vi.fn(() => ({ add: collectionAdd }));

vi.mock("@clerk/nextjs/server", () => ({ auth: () => Promise.resolve(clerkAuth()) }));
vi.mock("firebase-admin/database", () => ({
  getDatabase: () => ({ ref: dbRef }),
}));
vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({ createCustomToken }),
}));
vi.mock("firebase-admin/firestore", () => ({
  getFirestore: () => ({ collection }),
}));
vi.mock("@/lib/firebase-admin", () => ({ getFirebaseAdmin: () => ({}) }));

function post(body: unknown) {
  return new Request("http://localhost/api/link-device", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function pendingPairing(overrides: Record<string, unknown> = {}) {
  return {
    exists: () => true,
    val: () => ({
      deviceName: "waleed-thinkpad",
      platform: "linux-x11",
      appVersion: "0.1.0",
      protocolVersion: "1.2.0",
      createdAt: Date.now(),
      claimed: false,
      ...overrides,
    }),
  };
}

async function freshRoute() {
  // The attempt limiter is module-level state.
  vi.resetModules();
  return (await import("@/app/api/link-device/route")).POST;
}

describe("POST /api/link-device", () => {
  beforeEach(() => {
    clerkAuth.mockReturnValue({ userId: "user_1" });
    dbGet.mockReset();
    dbUpdate.mockReset().mockResolvedValue(undefined);
    dbRemove.mockReset().mockResolvedValue(undefined);
    dbRef.mockClear();
    createCustomToken.mockReset().mockResolvedValue("custom-token-abc");
    collectionAdd.mockReset().mockResolvedValue({ id: "device_1" });
    collection.mockClear();
  });

  it("refuses an unauthenticated caller before touching the pairing", async () => {
    clerkAuth.mockReturnValue({ userId: null });
    const POST = await freshRoute();
    const res = await POST(post({ code: "ABC234" }));
    expect(res.status).toBe(401);
    expect(dbRef).not.toHaveBeenCalled();
    expect(createCustomToken).not.toHaveBeenCalled();
  });

  it("mints the token for the session uid, not anything in the body", async () => {
    dbGet.mockResolvedValue(pendingPairing());
    const POST = await freshRoute();
    const res = await POST(post({ code: "ABC234", userId: "someone_else" }));
    expect(res.status).toBe(200);
    expect(createCustomToken).toHaveBeenCalledWith("user_1");
  });

  it("registers the linked device so /settings can show it", async () => {
    dbGet.mockResolvedValue(pendingPairing());
    const POST = await freshRoute();
    await POST(post({ code: "ABC234" }));

    expect(collection).toHaveBeenCalledWith("devices");
    const record = collectionAdd.mock.calls[0][0];
    expect(record).toMatchObject({
      ownerUid: "user_1",
      deviceName: "waleed-thinkpad",
      platform: "linux-x11",
      appVersion: "0.1.0",
      protocolVersion: "1.2.0",
    });
    // §8.2 — the list is sorted and dated from these.
    expect(typeof record.pairedAt).toBe("number");
    expect(typeof record.lastSeenAt).toBe("number");
  });

  it("registers the device only after the token exists", async () => {
    // A registry entry for a pairing that then failed is worse than none: the
    // machine shows as linked and is not.
    dbGet.mockResolvedValue(pendingPairing());
    createCustomToken.mockRejectedValue(new Error("signing failed"));
    const POST = await freshRoute();
    const res = await POST(post({ code: "ABC234" }));
    expect(res.status).toBe(500);
    expect(collectionAdd).not.toHaveBeenCalled();
  });

  it("still reports success if only the registry write fails", async () => {
    // The device is genuinely paired once the host has the token. Failing the
    // request here would tell the user their working pairing did not work.
    dbGet.mockResolvedValue(pendingPairing());
    collectionAdd.mockRejectedValue(new Error("firestore down"));
    const POST = await freshRoute();
    const res = await POST(post({ code: "ABC234" }));
    expect(res.status).toBe(200);
    expect(dbUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ claimed: true, customToken: "custom-token-abc" }),
    );
  });

  it("refuses a code that has already been claimed", async () => {
    dbGet.mockResolvedValue(pendingPairing({ claimed: true }));
    const POST = await freshRoute();
    const res = await POST(post({ code: "ABC234" }));
    expect(res.status).toBe(409);
    expect(createCustomToken).not.toHaveBeenCalled();
    expect(collectionAdd).not.toHaveBeenCalled();
  });

  it("refuses an expired code and clears it", async () => {
    dbGet.mockResolvedValue(
      pendingPairing({ createdAt: Date.now() - 11 * 60 * 1000 }),
    );
    const POST = await freshRoute();
    const res = await POST(post({ code: "ABC234" }));
    expect(res.status).toBe(410);
    expect(dbRemove).toHaveBeenCalled();
    expect(createCustomToken).not.toHaveBeenCalled();
  });

  it("refuses a malformed code without a lookup", async () => {
    const POST = await freshRoute();
    const res = await POST(post({ code: "abc" }));
    expect(res.status).toBe(400);
    expect(dbRef).not.toHaveBeenCalled();
  });
});
