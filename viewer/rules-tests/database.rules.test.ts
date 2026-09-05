import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { get, ref, remove, set, update } from "firebase/database";

/**
 * Behavioural tests for firebase/database.rules.json, against the real RTDB
 * rule engine in the emulator.
 *
 * `app/__tests__/database-rules.test.ts` asserts the *shape* of this file —
 * that a clause has not been deleted. That catches a removal, and nothing
 * else: a rule can be present, well-formed, and still not permit the thing the
 * product depends on. §10.2 as written in the plan is exactly that failure. Its
 * `.write` allowed `hostId == uid || viewerId == uid || !data.exists()`, all
 * three of which a joining viewer fails — the node exists, the host owns
 * hostId, and viewerId is still null — so §1.6-B's "write viewerId + ID token"
 * was refused at the rule layer and no session could ever reach REQUESTED.
 * Every rule was present and correct-looking. The product could not work.
 *
 * These run the rules instead of reading them. The first test is the one that
 * matters most: it is the deviation from §10.2, and it is the difference
 * between a viewer that connects and a viewer that enters a valid code and
 * hangs forever.
 */

const RULES = readFileSync(
  path.resolve(__dirname, "../../firebase/database.rules.json"),
  "utf8",
);

const HOST = "host-uid-1";
const VIEWER = "viewer-uid-1";
const STRANGER = "stranger-uid-1";

let testEnv: RulesTestEnvironment;

/** A session as the host writes it at §1.1 — waiting, unclaimed. */
function waitingSession(overrides: Record<string, unknown> = {}) {
  return {
    hostId: HOST,
    hostPlatform: "linux-x11",
    viewerId: null,
    status: "waiting",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

/** What §1.6-B has the viewer write to claim a session. */
function viewerClaim(uid = VIEWER) {
  return {
    viewerId: uid,
    viewerToken: "a".repeat(600),
    status: "requested",
    protocolVersion: "1.0.0",
    capabilities: ["video", "input"],
    updatedAt: Date.now(),
  };
}

async function seed(sessionPath: string, value: unknown) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await set(ref(ctx.database(), sessionPath), value);
  });
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-duxo",
    database: {
      rules: RULES,
      host: "127.0.0.1",
      port: 9000,
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearDatabase();
});

describe("sessions/$sessionId — the claim (§10.2 deviation, §1.6-B)", () => {
  it("lets an authenticated viewer claim a waiting, unclaimed session", async () => {
    // THE test. §10.2 as written refuses this, and refusing it means no
    // session ever reaches REQUESTED, which is a viewer that enters a valid
    // code and then waits forever with nothing to tell it why.
    await seed("sessions/s1", waitingSession());
    const db = testEnv.authenticatedContext(VIEWER).database();
    await assertSucceeds(update(ref(db, "sessions/s1"), viewerClaim()));
  });

  it("refuses a claim that sets someone else's uid as the viewer", async () => {
    // The clause is `newData.viewerId == auth.uid`. Without that equality a
    // viewer could attach an arbitrary identity to the session, and it is the
    // host's Allow dialog that would show it.
    await seed("sessions/s2", waitingSession());
    const db = testEnv.authenticatedContext(VIEWER).database();
    await assertFails(update(ref(db, "sessions/s2"), viewerClaim(STRANGER)));
  });

  it("refuses a second viewer once the session is claimed", async () => {
    await seed("sessions/s3", waitingSession({ viewerId: VIEWER, status: "requested" }));
    const db = testEnv.authenticatedContext(STRANGER).database();
    await assertFails(update(ref(db, "sessions/s3"), viewerClaim(STRANGER)));
  });

  it("refuses a claim on a session that has moved past waiting", async () => {
    // A code that has already been used. The claim clause is gated on
    // `status == 'waiting'` precisely so a live session cannot be joined by
    // whoever else happens to know the code.
    await seed("sessions/s4", waitingSession({ status: "active" }));
    const db = testEnv.authenticatedContext(STRANGER).database();
    await assertFails(update(ref(db, "sessions/s4"), viewerClaim(STRANGER)));
  });

  it("refuses an unauthenticated claim", async () => {
    await seed("sessions/s5", waitingSession());
    const db = testEnv.unauthenticatedContext().database();
    await assertFails(update(ref(db, "sessions/s5"), viewerClaim()));
  });
});

describe("sessions/$sessionId — reads (§0.7)", () => {
  it("lets the host and the claimed viewer read, and nobody else", async () => {
    await seed("sessions/s6", waitingSession({ viewerId: VIEWER, status: "requested" }));

    await assertSucceeds(
      get(ref(testEnv.authenticatedContext(HOST).database(), "sessions/s6")),
    );
    await assertSucceeds(
      get(ref(testEnv.authenticatedContext(VIEWER).database(), "sessions/s6")),
    );
    // Session hijacking is blocked at the rule layer, not by obscurity of the
    // session id.
    await assertFails(
      get(ref(testEnv.authenticatedContext(STRANGER).database(), "sessions/s6")),
    );
    await assertFails(
      get(ref(testEnv.unauthenticatedContext().database(), "sessions/s6")),
    );
  });

  it("lets the host write its own session", async () => {
    await seed("sessions/s7", waitingSession());
    const db = testEnv.authenticatedContext(HOST).database();
    await assertSucceeds(update(ref(db, "sessions/s7"), { status: "allowed" }));
  });

  it("refuses a status the state machine does not define", async () => {
    // §1.1 — an explicit enum, so "Allowed" and "allowed" cannot both exist.
    await seed("sessions/s8", waitingSession());
    const db = testEnv.authenticatedContext(HOST).database();
    await assertFails(update(ref(db, "sessions/s8"), { status: "Allowed" }));
  });
});

describe("codes/$code (§0.7)", () => {
  it("is unreadable by every client, including the host that owns it", async () => {
    // The 8-digit space is only 100M wide. Readable, it is enumerable by
    // anyone who can sign up, and every hit is a session they can then claim.
    // Lookups go through /api/resolve-code, which holds the Admin credential
    // and does the rate limiting the rules cannot.
    await seed("codes/12345678", { sessionId: "s1", hostId: HOST });
    await assertFails(
      get(ref(testEnv.authenticatedContext(HOST).database(), "codes/12345678")),
    );
    await assertFails(
      get(ref(testEnv.unauthenticatedContext().database(), "codes/12345678")),
    );
  });

  it("lets the owning host create and then retire its code", async () => {
    const db = testEnv.authenticatedContext(HOST).database();
    await assertSucceeds(
      set(ref(db, "codes/12345678"), { sessionId: "s1", hostId: HOST }),
    );
    await assertSucceeds(remove(ref(db, "codes/12345678")));
  });

  it("refuses another account repointing a live code", async () => {
    // Otherwise reading a code down the phone connects the caller to a machine
    // that is not the one they were told about.
    await seed("codes/12345678", { sessionId: "s1", hostId: HOST });
    const db = testEnv.authenticatedContext(STRANGER).database();
    await assertFails(
      set(ref(db, "codes/12345678"), { sessionId: "evil", hostId: STRANGER }),
    );
    await assertFails(remove(ref(db, "codes/12345678")));
  });

  it("refuses a code that is not exactly eight characters", async () => {
    // The length is a three-way contract — the host generates it, this rule
    // admits it, and the viewer's input enforces it — and each side learned it
    // separately.
    const db = testEnv.authenticatedContext(HOST).database();
    await assertFails(set(ref(db, "codes/1234567"), { sessionId: "s1", hostId: HOST }));
    await assertFails(set(ref(db, "codes/123456789"), { sessionId: "s1", hostId: HOST }));
  });

  it("refuses a code node that claims an owner it is not", async () => {
    const db = testEnv.authenticatedContext(HOST).database();
    await assertFails(
      set(ref(db, "codes/12345678"), { sessionId: "s1", hostId: STRANGER }),
    );
  });
});

/**
 * pairings/$code — the credential-issuing path, and the only node in the
 * ruleset an *unauthenticated* client may write. That is not an oversight:
 * the host agent has no Firebase identity until this exchange gives it one,
 * so it has to be able to publish its own node. Everything protecting the
 * exchange therefore lives in these rules and in /api/link-device.
 *
 * It had no behavioural coverage at all before this. The rules file carries
 * a comment about `claimed != true` versus `!...val()` breaking compilation
 * of the *whole ruleset* — found only by attempting a deploy — which is
 * exactly the class of thing a test against the real engine catches.
 */
describe("pairings/$code (§0.7, §2.1)", () => {
  const CODE = "ABC234";

  /** What the host agent publishes before it has any credential. */
  function pending(overrides: Record<string, unknown> = {}) {
    return {
      deviceName: "waleed-thinkpad",
      platform: "linux-x11",
      appVersion: "0.1.0",
      protocolVersion: "1.0.0",
      createdAt: Date.now(),
      ...overrides,
    };
  }

  it("lets an unauthenticated host publish a pairing", async () => {
    // The whole exchange rests on this being allowed.
    const db = testEnv.unauthenticatedContext().database();
    await assertSucceeds(set(ref(db, `pairings/${CODE}`), pending()));
  });

  it("refuses an unauthenticated node that pre-claims itself", async () => {
    // A node created already-claimed would let an attacker park a poisoned
    // pairing that /api/link-device's transaction then refuses to touch,
    // denying the real device its credential.
    const db = testEnv.unauthenticatedContext().database();
    await assertFails(
      set(ref(db, `pairings/${CODE}`), pending({ claimed: true })),
    );
  });

  it("refuses an unauthenticated overwrite of an existing pairing", async () => {
    // Create-only while unclaimed. Otherwise anyone who guesses a live code
    // can swap the device name the user is about to confirm.
    await seed(`pairings/${CODE}`, pending());
    const db = testEnv.unauthenticatedContext().database();
    await assertFails(
      set(ref(db, `pairings/${CODE}`), pending({ deviceName: "attacker-box" })),
    );
  });

  it("keeps the pairing itself unreadable, exposing only customToken", async () => {
    // Read on the node would let an unauthenticated caller enumerate pending
    // pairings and harvest device names; read on the token is what lets the
    // host, which knows the code, collect its own credential.
    await seed(`pairings/${CODE}`, pending({ customToken: "t".repeat(40) }));
    const db = testEnv.unauthenticatedContext().database();
    await assertFails(get(ref(db, `pairings/${CODE}`)));
    await assertSucceeds(get(ref(db, `pairings/${CODE}/customToken`)));
  });

  it("pins the fields the server reads back out of the node", async () => {
    // /api/link-device copies platform, appVersion and protocolVersion into
    // the device registry. The node is unauthenticated-writable, so their
    // shape has to be refused here rather than trusted there.
    const db = testEnv.unauthenticatedContext().database();
    await assertFails(
      set(ref(db, "pairings/BAD111"), pending({ platform: "solaris" })),
    );
    await assertFails(
      set(ref(db, "pairings/BAD222"), pending({ protocolVersion: "one.two" })),
    );
    await assertFails(
      set(ref(db, "pairings/BAD333"), pending({ deviceName: "x".repeat(200) })),
    );
    await assertFails(
      set(ref(db, "pairings/BAD444"), pending({ createdAt: Date.now() + 600_000 })),
    );
  });

  it("refuses a node missing the fields the server requires", async () => {
    const db = testEnv.unauthenticatedContext().database();
    await assertFails(set(ref(db, "pairings/BAD555"), { deviceName: "x" }));
  });

  it("lets the host retire its node once it holds a credential", async () => {
    // auth.rs::delete_pairing. The node holds a custom token that is good for
    // an hour and readable by anyone who knows the code, so retiring it is
    // the point of the authenticated clause — and the only thing it grants.
    await seed(`pairings/${CODE}`, pending({ customToken: "t".repeat(40) }));
    const db = testEnv.authenticatedContext(HOST).database();
    await assertSucceeds(remove(ref(db, `pairings/${CODE}`)));
  });

  it("refuses a signed-in stranger tampering with a pending pairing", async () => {
    // The authenticated clause was a bare `auth != null` and granted every
    // signed-in account full write on every pairing node. All three of these
    // succeeded against that rule, verified on the emulator:
    //
    //   - rewriting the device name the user is about to confirm, so the
    //     machine they approve is not the one named to them;
    //   - setting `claimed`, stranding a real device that can then never
    //     collect its credential;
    //   - injecting a bogus customToken for the host to choke on.
    //
    // Narrowing the clause to `!newData.exists()` leaves the delete the host
    // genuinely needs and removes every write above.
    await seed(`pairings/${CODE}`, pending());
    const db = testEnv.authenticatedContext(STRANGER).database();
    await assertFails(update(ref(db, `pairings/${CODE}`), { deviceName: "attacker-box" }));
    await assertFails(update(ref(db, `pairings/${CODE}`), { claimed: true }));
    await assertFails(update(ref(db, `pairings/${CODE}`), { customToken: "z".repeat(40) }));
  });
});

/**
 * auditLog/$uid — §7.3's append-only hash chain.
 *
 * The tip and the entries have opposite requirements (one must be
 * rewritable, the others must never be), and the rules file records that
 * they once collided: `_tip` matched the `$entryId` wildcard, so the tip
 * could never be written, `get_tip_hash` always returned None, and every
 * entry chained onto "0" — a hash chain in shape only. These assert the
 * split that fixed it.
 */
describe("auditLog/$uid (§7.3)", () => {
  function entry(uid = HOST, overrides: Record<string, unknown> = {}) {
    return {
      uid,
      action: "session_started",
      timestamp: Date.now(),
      previousHash: "0".repeat(64),
      ...overrides,
    };
  }

  it("lets an owner append an entry and read its own log", async () => {
    const db = testEnv.authenticatedContext(HOST).database();
    await assertSucceeds(set(ref(db, `auditLog/${HOST}/e1`), entry()));
    await assertSucceeds(get(ref(db, `auditLog/${HOST}`)));
  });

  it("refuses rewriting an entry, which is what makes the chain evidence", async () => {
    await seed(`auditLog/${HOST}/e1`, entry());
    const db = testEnv.authenticatedContext(HOST).database();
    await assertFails(
      set(ref(db, `auditLog/${HOST}/e1`), entry(HOST, { action: "tampered" })),
    );
  });

  it("lets the tip be rewritten, unlike the entries it points at", async () => {
    // The tip is a pointer, not evidence. If it cannot be overwritten the
    // chain never advances past its first link.
    const db = testEnv.authenticatedContext(HOST).database();
    await assertSucceeds(set(ref(db, `auditLog/${HOST}/_tip`), { hash: "a".repeat(64) }));
    await assertSucceeds(set(ref(db, `auditLog/${HOST}/_tip`), { hash: "b".repeat(64) }));
  });

  it("keeps one account out of another's log entirely", async () => {
    await seed(`auditLog/${HOST}/e1`, entry());
    const db = testEnv.authenticatedContext(STRANGER).database();
    await assertFails(get(ref(db, `auditLog/${HOST}`)));
    await assertFails(set(ref(db, `auditLog/${HOST}/e2`), entry(HOST)));
  });

  it("refuses an entry that backdates itself or misattributes its uid", async () => {
    const db = testEnv.authenticatedContext(HOST).database();
    await assertFails(
      set(ref(db, `auditLog/${HOST}/e3`), entry(STRANGER)),
    );
    await assertFails(
      set(ref(db, `auditLog/${HOST}/e4`), entry(HOST, { timestamp: Date.now() + 600_000 })),
    );
  });
});
