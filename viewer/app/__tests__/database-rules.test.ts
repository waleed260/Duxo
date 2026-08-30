import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Static invariants over firebase/database.rules.json.
 *
 * The RTDB emulator needs Java, which is not available here, so this is not a
 * behavioural test of the rule engine. It is the next most useful thing: the
 * rules are the only barrier between one account's sessions and another's, and
 * every property below is one that, if quietly removed, reopens a hole without
 * breaking a single test or failing a build. Each assertion names the failure
 * it exists to prevent.
 */

const rulesPath = path.resolve(__dirname, "../../../firebase/database.rules.json");

function loadRules() {
  const raw = readFileSync(rulesPath, "utf8");
  // The file carries `//` comments by convention; the Firebase CLI strips them
  // the same way before parsing.
  return JSON.parse(raw.replace(/^\s*\/\/.*$/gm, "")).rules;
}

const rules = loadRules();

describe("RTDB security rules (§10.2)", () => {
  it("parses, and still defines every node the product depends on", () => {
    for (const node of ["sessions", "codes", "pairings", "auditLog"]) {
      expect(rules[node], `${node} rules disappeared`).toBeDefined();
    }
  });

  describe("codes/$code (§0.7)", () => {
    const code = rules.codes.$code;

    it("is not readable by any client", () => {
      // `auth != null` here is what made the 8-digit space enumerable by
      // anyone who could sign up. Lookups go through /api/resolve-code, which
      // holds the Admin credential and does the rate limiting.
      expect(code[".read"]).toBe(false);
    });

    it("only lets the owning host create or retire a code", () => {
      // Without the hostId check, any signed-in account could repoint a live
      // code at a session of its own — so the person reading a code down the
      // phone connects to a machine that is not the one they were told about.
      expect(code[".write"]).toContain("newData.child('hostId').val() == auth.uid");
      expect(code[".write"]).toContain("data.child('hostId').val() == auth.uid");
      expect(code[".write"]).toContain("!data.exists()");
    });

    it("requires the code node to carry its owner", () => {
      expect(code[".validate"]).toContain("hostId");
      expect(code[".validate"]).toContain("sessionId");
    });

    it("pins the code to exactly 8 characters", () => {
      // The length is a three-way contract and each side learned it
      // separately: the host generates the code, this rule admits it, and
      // `/api/resolve-code` plus the viewer's input accept it. The host was
      // generating *nine* digits — `1_0000_0000..10_0000_0000` reads as eight
      // groups but is 100,000,000 to 999,999,999 — and because the code node
      // is written in the same atomic multi-path PATCH as the session node,
      // this rule refusing it meant no session could be created at all. The
      // viewer's half was already pinned; this is the half that was not.
      expect(code[".write"]).toContain("$code.length == 8");
    });
  });

  describe("sessions/$sessionId (§0.7, §1.6-B)", () => {
    const session = rules.sessions.$sessionId;

    it("restricts reads to the host and the viewer", () => {
      expect(session[".read"]).toContain("hostId");
      expect(session[".read"]).toContain("viewerId");
      expect(session[".read"]).toContain("auth != null");
    });

    it("keeps the viewer-claim clause, without which no session can start", () => {
      // §10.2 as written in the plan admits hostId/viewerId/!exists only, and
      // a viewer joining a host-created session matches none of the three. The
      // claim clause is what lets a session reach REQUESTED at all; removing
      // it presents as a viewer that enters a valid code and then hangs.
      expect(session[".write"]).toContain("newData.child('viewerId').val() == auth.uid");
      expect(session[".write"]).toContain("'waiting'");
    });

    it("lets only the viewer write its own ID token", () => {
      // §2.5 — the host verifies this token's signature and shows the email
      // from its claims. If anyone could write it, an attacker would choose
      // the name the victim sees before clicking Allow.
      expect(session.viewerToken[".validate"]).toContain(
        "newData.parent().child('viewerId').val() == auth.uid",
      );
    });

    it("pins status to the enum the host writes", () => {
      // A status the rules reject leaves the session stuck in its previous
      // state, with only a 401 in a log to say why.
      for (const status of [
        "waiting",
        "requested",
        "allowed",
        "denied",
        "connecting",
        "active",
        "ended",
        "expired",
      ]) {
        expect(session.status[".validate"]).toContain(`'${status}'`);
      }
    });

    it("bounds SDP and ICE payloads (§0.6)", () => {
      expect(session.offer[".validate"]).toContain("length <= 10000");
      expect(session.answer[".validate"]).toContain("length <= 10000");
    });

    it("validates the §6.1 protocol declaration as viewer-written", () => {
      expect(session.protocolVersion[".validate"]).toContain(
        "newData.parent().child('viewerId').val() == auth.uid",
      );
    });
  });

  describe("auditLog/$uid (§7.3)", () => {
    it("keeps entries append-only — that is what the hash chain rests on", () => {
      expect(rules.auditLog.$uid.$entryId[".write"]).toContain("!data.exists()");
      expect(rules.auditLog.$uid.$entryId[".write"]).toContain("auth.uid == $uid");
    });

    it("gives the chain tip its own rewritable rule", () => {
      // _tip used to match $entryId, whose whole purpose is !data.exists().
      // The tip could therefore never be written, get_tip_hash always returned
      // nothing, and every entry recorded previousHash "0" — a hash chain in
      // shape only, chaining nothing to anything.
      const tip = rules.auditLog.$uid._tip;
      expect(tip, "_tip must have its own rule, or it matches $entryId").toBeDefined();
      expect(tip[".write"]).not.toContain("!data.exists()");
      expect(tip[".write"]).toContain("auth.uid == $uid");
    });

    it("scopes reads to the owner", () => {
      expect(rules.auditLog.$uid[".read"]).toContain("auth.uid == $uid");
    });
  });

  describe("pairings/$code (§2.6)", () => {
    it("is create-only while unclaimed", () => {
      // The host has no credential yet, so it must be able to create its own
      // node. That is only safe because it is single-use and the node carries
      // no secret in the direction the host writes.
      expect(rules.pairings.$code[".write"]).toContain("!data.exists()");
    });

    it("pins the protocol version the device registry records", () => {
      // Written by the host with the pairing request and read back by
      // /api/link-device into `devices/{id}`, so it is server-consumed input
      // and gets the same treatment as every other field on this node.
      expect(rules.pairings.$code.protocolVersion[".validate"]).toContain("isString()");
    });

    it("exposes only customToken to an unauthenticated reader", () => {
      // A readable parent would let anyone enumerate pending pairings and the
      // device names attached to them.
      expect(rules.pairings.$code[".read"]).toBeUndefined();
      expect(rules.pairings.$code.customToken[".read"]).toBe(true);
    });
  });
});
