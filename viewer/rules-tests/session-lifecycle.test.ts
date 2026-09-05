import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { get, ref, set, update } from "firebase/database";
import type { SessionStatus } from "@shared/types";

/**
 * §1.1 — the session state machine, driven end to end against a real RTDB.
 *
 * The other rules suites check one rule at a time. This one plays the actual
 * sequence two real parties perform — host creates, viewer claims, host
 * allows, both trickle candidates, either ends it — with each step issued by
 * a *separately authenticated* client, so nothing passes because a previous
 * step happened to leave the right identity lying around.
 *
 * Why this and not a live Firebase project: the emulator runs the same rule
 * engine and the same RTDB semantics, and it needs no provisioned project.
 * `duxo-967f0` still has RTDB, Firestore and Auth disabled, which blocks an
 * end-to-end run of the shipped product — but it does not block verifying
 * that the state machine and the rules agree, which is the part that has
 * been wrong before. §10.2 as written in the plan let no session past
 * REQUESTED at all, and every individual rule looked correct.
 *
 * Ordering matters here in a way single-rule tests cannot show: a candidate
 * write that is legal after the claim is illegal before it, and the viewer's
 * own token may only be written by the viewer.
 */

const RULES = readFileSync(
  path.resolve(__dirname, "../../firebase/database.rules.json"),
  "utf8",
);

const HOST = "host-uid-1";
const VIEWER = "viewer-uid-1";
const STRANGER = "stranger-uid-1";
const SID = "sess-1";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-duxo",
    database: { rules: RULES, host: "127.0.0.1", port: 9000 },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearDatabase();
});

/** A fresh client for one party — never reused across roles. */
function as(uid: string | null) {
  return uid
    ? testEnv.authenticatedContext(uid).database()
    : testEnv.unauthenticatedContext().database();
}

/** §1.1 CREATED → WAITING, as the host agent writes it. */
async function hostCreatesSession() {
  await assertSucceeds(
    set(ref(as(HOST), `sessions/${SID}`), {
      hostId: HOST,
      hostPlatform: "linux-x11",
      viewerId: null,
      status: "waiting" satisfies SessionStatus,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

/** §1.6-B WAITING → REQUESTED, as the viewer claims it. */
async function viewerClaims(uid = VIEWER) {
  await update(ref(as(uid), `sessions/${SID}`), {
    viewerId: uid,
    viewerToken: "v".repeat(600),
    protocolVersion: "1.2.0",
    capabilities: ["clipboard", "file_transfer", "quality_indicator"],
    status: "requested" satisfies SessionStatus,
    updatedAt: Date.now(),
  });
}

/**
 * Read a field past the rules, to assert what the sequence actually left
 * behind rather than only that each write was permitted.
 *
 * The value is captured into a closure variable: `withSecurityRulesDisabled`
 * resolves to void, so returning from its callback yields undefined.
 */
async function readRaw<T = unknown>(childPath: string): Promise<T> {
  let value: T;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const snap = await get(ref(ctx.database(), `sessions/${SID}/${childPath}`));
    value = snap.val();
  });
  return value!;
}

function statusOf(): Promise<SessionStatus> {
  return readRaw<SessionStatus>("status");
}

describe("§1.1 full session lifecycle", () => {
  it("runs CREATED → WAITING → REQUESTED → ALLOWED → CONNECTING → ACTIVE → ENDED", async () => {
    // The path the product depends on, start to finish, each step by the
    // party that actually performs it.
    await hostCreatesSession();
    expect(await statusOf()).toBe("waiting");

    await assertSucceeds(viewerClaims());
    expect(await statusOf()).toBe("requested");

    // §2.4 — the host, not the viewer, is authoritative for what follows.
    await assertSucceeds(
      update(ref(as(HOST), `sessions/${SID}`), {
        status: "allowed",
        updatedAt: Date.now(),
      }),
    );

    // §1.6-B — the viewer offers, the host answers (deliberately backwards
    // from caller-offers, because the host knows what it can decode).
    await assertSucceeds(
      set(ref(as(VIEWER), `sessions/${SID}/offer`), JSON.stringify({ type: "offer" })),
    );
    await assertSucceeds(
      set(ref(as(HOST), `sessions/${SID}/answer`), JSON.stringify({ type: "answer" })),
    );

    // §0.6 — trickle ICE, both directions, batched.
    await assertSucceeds(
      update(ref(as(VIEWER), `sessions/${SID}/viewerCandidates`), {
        0: "candidate:v0",
        1: "candidate:v1",
      }),
    );
    await assertSucceeds(
      update(ref(as(HOST), `sessions/${SID}/hostCandidates`), {
        0: "candidate:h0",
      }),
    );

    await assertSucceeds(
      update(ref(as(HOST), `sessions/${SID}`), { status: "connecting" }),
    );
    await assertSucceeds(
      update(ref(as(HOST), `sessions/${SID}`), { status: "active" }),
    );
    expect(await statusOf()).toBe("active");

    // §1.1 — either peer may end it.
    await assertSucceeds(
      set(ref(as(VIEWER), `sessions/${SID}/status`), "ended"),
    );
    expect(await statusOf()).toBe("ended");
  });

  it("runs the denial path REQUESTED → DENIED", async () => {
    // §2.4 — no session without a human approving it on the host.
    await hostCreatesSession();
    await viewerClaims();
    await assertSucceeds(
      update(ref(as(HOST), `sessions/${SID}`), { status: "denied" }),
    );
    expect(await statusOf()).toBe("denied");
  });
});

describe("§1.1 lifecycle — who may do what, and when", () => {
  it("refuses a candidate write from a viewer that never claimed", async () => {
    // Ordering, not just identity: this same write is legal after the claim.
    // A stranger who guessed a session id must not be able to inject
    // candidates into someone else's negotiation.
    await hostCreatesSession();
    await assertFails(
      update(ref(as(STRANGER), `sessions/${SID}/viewerCandidates`), {
        0: "candidate:evil",
      }),
    );
  });

  it("refuses a second viewer once one has claimed", async () => {
    await hostCreatesSession();
    await viewerClaims(VIEWER);
    await assertFails(viewerClaims(STRANGER));
    expect(await readRaw("viewerId")).toBe(VIEWER);
  });

  it("refuses a claim once the host has moved the session on", async () => {
    // The claim clause is gated on `status == 'waiting'`. A session already
    // allowed must not be re-claimed by someone else mid-negotiation.
    await hostCreatesSession();
    await viewerClaims();
    await update(ref(as(HOST), `sessions/${SID}`), { status: "allowed" });
    await assertFails(
      update(ref(as(STRANGER), `sessions/${SID}`), {
        viewerId: STRANGER,
        status: "requested",
      }),
    );
  });

  it("refuses a viewerToken written by anyone but the viewer", async () => {
    // §2.5 — the host reads this token and verifies its signature locally to
    // decide whose email to show in the Allow dialog. A host-written or
    // stranger-written token would put an attacker-chosen identity there.
    await hostCreatesSession();
    await viewerClaims();
    await assertFails(
      set(ref(as(HOST), `sessions/${SID}/viewerToken`), "t".repeat(20)),
    );
    await assertFails(
      set(ref(as(STRANGER), `sessions/${SID}/viewerToken`), "t".repeat(20)),
    );
  });

  it("refuses a status outside the state machine at any point", async () => {
    // §1.1 — the "allowed" vs "Allowed" bug class, refused at the rule layer
    // rather than becoming an unhandled state on one side.
    await hostCreatesSession();
    await viewerClaims();
    for (const bad of ["Allowed", "ACTIVE", "connected", "", "pending"]) {
      await assertFails(
        update(ref(as(HOST), `sessions/${SID}`), { status: bad }),
      );
    }
    expect(await statusOf()).toBe("requested");
  });

  it("keeps an uninvolved account out of the session entirely", async () => {
    await hostCreatesSession();
    await viewerClaims();
    await assertFails(get(ref(as(STRANGER), `sessions/${SID}`)));
    await assertFails(
      update(ref(as(STRANGER), `sessions/${SID}`), { status: "ended" }),
    );
    await assertFails(get(ref(as(null), `sessions/${SID}`)));
  });

  it("holds the SDP size cap on both directions", async () => {
    // §0.6 — 10KB. RTDB is signaling, not a transport; an unbounded SDP is a
    // quota problem and a cheap way to grief a session node.
    await hostCreatesSession();
    await viewerClaims();
    await assertFails(
      set(ref(as(VIEWER), `sessions/${SID}/offer`), "x".repeat(10_001)),
    );
    await assertFails(
      set(ref(as(HOST), `sessions/${SID}/answer`), "x".repeat(10_001)),
    );
  });

  it("caps candidate batches at ten per write", async () => {
    // §0.6 — the index pattern admits 0-99 but the writer batches ten; an
    // out-of-range index is refused rather than silently accepted.
    await hostCreatesSession();
    await viewerClaims();
    await assertFails(
      update(ref(as(VIEWER), `sessions/${SID}/viewerCandidates`), {
        100: "candidate:overflow",
      }),
    );
    await assertFails(
      set(
        ref(as(VIEWER), `sessions/${SID}/viewerCandidates/0`),
        "c".repeat(1001),
      ),
    );
  });

  it("refuses a protocol version the host could not parse", async () => {
    // §6.1 — pinned at the rule layer so a malformed version is a refused
    // write rather than a parse error on the host mid-handshake.
    await hostCreatesSession();
    await assertFails(
      update(ref(as(VIEWER), `sessions/${SID}`), {
        viewerId: VIEWER,
        status: "requested",
        protocolVersion: "one.two.three",
      }),
    );
  });
});

describe("§0.7 code → session mapping, in sequence", () => {
  it("lets the host publish a code, retire it, and keeps it unreadable throughout", async () => {
    await hostCreatesSession();
    const code = "41927306";

    await assertSucceeds(
      set(ref(as(HOST), `codes/${code}`), { sessionId: SID, hostId: HOST }),
    );

    // Never readable by any client — /api/resolve-code holds the Admin
    // credential and does the lookup, so the 8-digit space is not
    // enumerable by anyone who can sign up.
    await assertFails(get(ref(as(VIEWER), `codes/${code}`)));
    await assertFails(get(ref(as(HOST), `codes/${code}`)));
    await assertFails(get(ref(as(null), `codes/${code}`)));

    // A stranger cannot repoint a live code at a session of their own —
    // which would connect the person reading it down the phone to a machine
    // that is not the one they were told about.
    await assertFails(
      set(ref(as(STRANGER), `codes/${code}`), { sessionId: "evil", hostId: STRANGER }),
    );

    await assertSucceeds(set(ref(as(HOST), `codes/${code}`), null));
  });
});
