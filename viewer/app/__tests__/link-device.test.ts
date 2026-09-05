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
const dbTransaction = vi.fn();
const dbRef = vi.fn(() => ({
  get: dbGet,
  update: dbUpdate,
  remove: dbRemove,
  transaction: dbTransaction,
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
    // Default: this caller wins the claim. The updater is run against the
    // same pairing `get` returned, so an aborting updater (undefined) reports
    // itself as uncommitted exactly as the real transaction would.
    dbTransaction.mockReset().mockImplementation(async (updater) => {
      const current = dbGet.mock.results.length
        ? (await dbGet.mock.results[0].value)?.val?.()
        : null;
      const next = updater(current ?? null);
      return { committed: next !== undefined, snapshot: { val: () => next } };
    });
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
      expect.objectContaining({ customToken: "custom-token-abc" }),
    );
  });

  it("claims the code atomically before minting anything", async () => {
    // Read-then-write is not single use: two callers can both pass the
    // `claimed` check on a stale snapshot and both mint a token, for two
    // different uids, and the host picks up whichever write landed last.
    // The claim has to be a transaction, and it has to happen first.
    dbGet.mockResolvedValue(pendingPairing());
    const order: string[] = [];
    dbTransaction.mockImplementation(async (updater) => {
      order.push("claim");
      const next = updater({ createdAt: Date.now(), claimed: false });
      return { committed: next !== undefined, snapshot: { val: () => next } };
    });
    createCustomToken.mockImplementation(async () => {
      order.push("mint");
      return "custom-token-abc";
    });

    const POST = await freshRoute();
    const res = await POST(post({ code: "ABC234" }));

    expect(res.status).toBe(200);
    expect(order).toEqual(["claim", "mint"]);
    // The claim's updater must actually set the flag, not just read it.
    const updater = dbTransaction.mock.calls[0][0];
    expect(updater({ createdAt: Date.now(), claimed: false })).toMatchObject({
      claimed: true,
    });
  });

  it("refuses to mint when another caller won the claim", async () => {
    // The losing side of the race. `get` still saw an unclaimed node — that
    // snapshot is what makes this a race rather than a plain 409 — so the
    // transaction is the only thing standing between the attacker and a
    // token minted for their own uid against someone else's machine.
    dbGet.mockResolvedValue(pendingPairing());
    dbTransaction.mockResolvedValue({ committed: false, snapshot: { val: () => null } });

    const POST = await freshRoute();
    const res = await POST(post({ code: "ABC234" }));

    expect(res.status).toBe(409);
    expect(createCustomToken).not.toHaveBeenCalled();
    expect(dbUpdate).not.toHaveBeenCalled();
    expect(collectionAdd).not.toHaveBeenCalled();
  });

  it("aborts the claim on a code that expired between read and transaction", async () => {
    // The TTL is re-checked inside the updater because the snapshot above may
    // have been read microseconds before expiry.
    dbGet.mockResolvedValue(pendingPairing());
    const POST = await freshRoute();
    await POST(post({ code: "ABC234" }));

    const updater = dbTransaction.mock.calls[0][0];
    expect(updater({ createdAt: Date.now() - 11 * 60 * 1000, claimed: false })).toBeUndefined();
    expect(updater({ createdAt: Date.now(), claimed: true })).toBeUndefined();
    expect(updater(null)).toBeUndefined();
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
