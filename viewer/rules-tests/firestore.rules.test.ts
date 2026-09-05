import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";

/**
 * Behavioural tests for firebase/firestore.rules, against the real Firestore
 * rule engine in the emulator.
 *
 * These did not exist. The `emulators` block in firebase.json declared only
 * `database`, and `test:rules` ran `--only database`, so nothing had ever
 * executed this ruleset — the durable half of the data model (profiles, the
 * device registry, session history, the audit log) was covered by review
 * alone. The RTDB rules already carry two comments about clauses that looked
 * correct and were not, one of which stopped the whole ruleset compiling; the
 * same class of mistake here would have been just as invisible.
 *
 * What is asserted is ownership and append-only-ness, because that is what
 * the product's privacy claims rest on: §6.3's records are per-user, and
 * §7.3's audit chain is evidence only if entries cannot be rewritten.
 */

const RULES = readFileSync(
  path.resolve(__dirname, "../../firebase/firestore.rules"),
  "utf8",
);

const OWNER = "owner-uid-1";
const STRANGER = "stranger-uid-1";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-duxo",
    firestore: { rules: RULES, host: "127.0.0.1", port: 8080 },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

/** Write a document past the rules, to set up a precondition. */
async function seed(docPath: string, value: Record<string, unknown>) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), docPath), value);
  });
}

function db(uid: string | null) {
  return uid
    ? testEnv.authenticatedContext(uid).firestore()
    : testEnv.unauthenticatedContext().firestore();
}

describe("users/{uid} (§6.3, §2.3)", () => {
  it("lets an owner create, read and update only their own profile", async () => {
    await assertSucceeds(
      setDoc(doc(db(OWNER), `users/${OWNER}`), { totpEnabled: false }),
    );
    await assertSucceeds(getDoc(doc(db(OWNER), `users/${OWNER}`)));
    await assertSucceeds(
      updateDoc(doc(db(OWNER), `users/${OWNER}`), { totpEnabled: true }),
    );
  });

  it("keeps one account out of another's profile", async () => {
    // The profile holds the encrypted TOTP secret (§2.3). A readable
    // neighbour's document is the whole second factor.
    await seed(`users/${OWNER}`, { totpEnabled: true, encryptedTotpSecret: "x" });
    await assertFails(getDoc(doc(db(STRANGER), `users/${OWNER}`)));
    await assertFails(
      updateDoc(doc(db(STRANGER), `users/${OWNER}`), { totpEnabled: false }),
    );
    await assertFails(
      setDoc(doc(db(STRANGER), `users/${STRANGER}_forged`), { totpEnabled: false }),
    );
  });

  it("refuses deletion even by the owner", async () => {
    // §10.6 — account deletion is a deliberate multi-step flow, not a
    // one-call delete, so this rule is what stops an accidental loss.
    await seed(`users/${OWNER}`, { totpEnabled: true });
    await assertFails(deleteDoc(doc(db(OWNER), `users/${OWNER}`)));
  });

  it("refuses an unauthenticated caller entirely", async () => {
    await seed(`users/${OWNER}`, { totpEnabled: true });
    await assertFails(getDoc(doc(db(null), `users/${OWNER}`)));
    await assertFails(setDoc(doc(db(null), "users/anyone"), { totpEnabled: false }));
  });
});

describe("users/{uid}/webauthn/{credentialId} (§8.1)", () => {
  it("lets an owner manage their own credentials", async () => {
    const ref = doc(db(OWNER), `users/${OWNER}/webauthn/cred1`);
    await assertSucceeds(setDoc(ref, { publicKey: "pk", counter: 0 }));
    await assertSucceeds(updateDoc(ref, { counter: 1 }));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(deleteDoc(ref));
  });

  it("keeps a stranger out of someone else's credentials", async () => {
    // Registering a credential under another user's subcollection would be a
    // second factor the attacker controls.
    await seed(`users/${OWNER}/webauthn/cred1`, { publicKey: "pk", counter: 0 });
    const ref = doc(db(STRANGER), `users/${OWNER}/webauthn/cred1`);
    await assertFails(getDoc(ref));
    await assertFails(deleteDoc(ref));
    await assertFails(
      setDoc(doc(db(STRANGER), `users/${OWNER}/webauthn/attacker`), {
        publicKey: "evil",
        counter: 0,
      }),
    );
  });
});

describe("devices/{deviceId} (§6.3, §8.2)", () => {
  it("lets an owner register and revoke a device of their own", async () => {
    await assertSucceeds(
      setDoc(doc(db(OWNER), "devices/d1"), {
        ownerUid: OWNER,
        deviceName: "thinkpad",
        platform: "linux-x11",
      }),
    );
    await assertSucceeds(getDoc(doc(db(OWNER), "devices/d1")));
    await assertSucceeds(deleteDoc(doc(db(OWNER), "devices/d1")));
  });

  it("refuses registering a device against someone else's account", async () => {
    await assertFails(
      setDoc(doc(db(STRANGER), "devices/d2"), {
        ownerUid: OWNER,
        deviceName: "attacker-box",
        platform: "linux-x11",
      }),
    );
  });

  it("hides one account's devices from another and blocks revocation", async () => {
    await seed("devices/d3", { ownerUid: OWNER, deviceName: "thinkpad" });
    await assertFails(getDoc(doc(db(STRANGER), "devices/d3")));
    await assertFails(deleteDoc(doc(db(STRANGER), "devices/d3")));
  });

  it("refuses updates outright, since re-registration recreates", async () => {
    await seed("devices/d4", { ownerUid: OWNER, deviceName: "thinkpad" });
    await assertFails(
      updateDoc(doc(db(OWNER), "devices/d4"), { deviceName: "renamed" }),
    );
  });
});

describe("sessionHistory/{sessionId} (§6.3)", () => {
  it("lets either party to a session write its record", async () => {
    await assertSucceeds(
      setDoc(doc(db(OWNER), "sessionHistory/s1"), {
        hostUid: OWNER,
        viewerUid: STRANGER,
        durationSec: 42,
      }),
    );
    await assertSucceeds(
      setDoc(doc(db(STRANGER), "sessionHistory/s2"), {
        hostUid: OWNER,
        viewerUid: STRANGER,
        durationSec: 42,
      }),
    );
  });

  it("refuses forging history that names people who were not there", async () => {
    // §10.1 has this as a bare `request.auth != null`. That would let any
    // signed-in account write a record attributing a session to two
    // strangers, and the read rule would then show the forgery to the named
    // victim as their own history.
    await assertFails(
      setDoc(doc(db("third-party-uid"), "sessionHistory/s3"), {
        hostUid: OWNER,
        viewerUid: STRANGER,
        durationSec: 42,
      }),
    );
  });

  it("shows a record only to its two parties", async () => {
    await seed("sessionHistory/s4", { hostUid: OWNER, viewerUid: "viewer-uid-9" });
    await assertSucceeds(getDoc(doc(db(OWNER), "sessionHistory/s4")));
    await assertSucceeds(getDoc(doc(db("viewer-uid-9"), "sessionHistory/s4")));
    await assertFails(getDoc(doc(db(STRANGER), "sessionHistory/s4")));
  });

  it("keeps history append-only", async () => {
    await seed("sessionHistory/s5", { hostUid: OWNER, viewerUid: STRANGER });
    await assertFails(
      updateDoc(doc(db(OWNER), "sessionHistory/s5"), { durationSec: 0 }),
    );
    await assertFails(deleteDoc(doc(db(OWNER), "sessionHistory/s5")));
  });
});

describe("auditLog/{entryId} (§7.3)", () => {
  it("lets an owner append an entry attributed to themselves", async () => {
    await assertSucceeds(
      setDoc(doc(db(OWNER), "auditLog/e1"), {
        uid: OWNER,
        action: "session_started",
        timestamp: Date.now(),
      }),
    );
  });

  it("refuses an entry attributed to someone else", async () => {
    await assertFails(
      setDoc(doc(db(STRANGER), "auditLog/e2"), {
        uid: OWNER,
        action: "forged",
        timestamp: Date.now(),
      }),
    );
  });

  it("keeps the chain append-only, which is what makes it evidence", async () => {
    // §7.3's tamper-evidence is a hash chain. A rewritable entry lets an
    // attacker recompute the chain over an edited history.
    await seed("auditLog/e3", { uid: OWNER, action: "session_started" });
    await assertFails(updateDoc(doc(db(OWNER), "auditLog/e3"), { action: "tampered" }));
    await assertFails(deleteDoc(doc(db(OWNER), "auditLog/e3")));
  });

  it("shows an entry only to the account it belongs to", async () => {
    await seed("auditLog/e4", { uid: OWNER, action: "session_started" });
    await assertSucceeds(getDoc(doc(db(OWNER), "auditLog/e4")));
    await assertFails(getDoc(doc(db(STRANGER), "auditLog/e4")));
  });
});

describe("collections the rules do not mention", () => {
  it("denies everything by default", async () => {
    // Firestore denies unmatched paths, but the product's privacy claim
    // depends on that staying true as collections are added.
    await assertFails(setDoc(doc(db(OWNER), "arbitrary/doc1"), { x: 1 }));
    await assertFails(getDoc(doc(db(OWNER), "arbitrary/doc1")));
  });
});
