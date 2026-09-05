import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DuxoConnection } from "@/lib/webrtc";

/**
 * §1.3 #3–#5 — what happens between "the connection dropped" and "tell the
 * user to get a new code".
 *
 * None of this is visible to a type check, and none of it can be reached by
 * clicking around a working network: it only runs when ICE fails, which is
 * the one path a developer never sees and the user sees on the worst day.
 * So it is pinned here.
 */

type IceState = RTCIceConnectionState;

/** The parts of RTCPeerConnection this module actually touches. */
class FakePeerConnection {
  static instances: FakePeerConnection[] = [];

  signalingState: RTCSignalingState = "stable";
  iceConnectionState: IceState = "new";
  connectionState: RTCPeerConnectionState = "new";
  remoteDescription: RTCSessionDescriptionInit | null = null;
  localDescription: RTCSessionDescriptionInit | null = null;

  onicecandidate: ((e: { candidate: RTCIceCandidate | null }) => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  ontrack: ((e: { streams: MediaStream[] }) => void) | null = null;

  offers = 0;
  restarts = 0;

  constructor() {
    FakePeerConnection.instances.push(this);
  }

  createDataChannel() {
    return { readyState: "connecting", send: vi.fn(), close: vi.fn() };
  }

  async createOffer(options?: RTCOfferOptions) {
    this.offers += 1;
    if (options?.iceRestart) this.restarts += 1;
    return { type: "offer" as const, sdp: `offer-${this.offers}` };
  }

  async setLocalDescription(d: RTCSessionDescriptionInit) {
    this.localDescription = d;
    this.signalingState = "have-local-offer";
  }

  async setRemoteDescription(d: RTCSessionDescriptionInit) {
    if (this.signalingState !== "have-local-offer") {
      // Matches the browser: applying an answer in `stable` throws.
      throw new Error("InvalidStateError");
    }
    this.remoteDescription = d;
    this.signalingState = "stable";
  }

  addedCandidates: RTCIceCandidateInit[] = [];
  async addIceCandidate(c: RTCIceCandidateInit) {
    // Matches the browser: a candidate cannot be applied before there is a
    // remote description to attach it to.
    if (!this.remoteDescription) throw new Error("InvalidStateError");
    this.addedCandidates.push(c);
  }
  close() {}

  /** Drive the state machine the way the browser would. */
  setIceState(state: IceState) {
    this.iceConnectionState = state;
    this.oniceconnectionstatechange?.();
  }
}

const iceConfig = {
  stunUrls: ["stun:stun.l.google.com:19302"],
  turnUrls: [],
  turnUsername: undefined,
  turnCredential: undefined,
};

beforeEach(() => {
  FakePeerConnection.instances = [];
  vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Run every pending backoff timer until the connection stops scheduling. */
async function settle() {
  for (let i = 0; i < 20; i += 1) {
    await vi.advanceTimersByTimeAsync(10_000);
  }
}

describe("§1.3 ICE restart budget", () => {
  it("gives up after five restarts instead of retrying forever", async () => {
    const onUnrecoverable = vi.fn();
    const conn = new DuxoConnection(iceConfig, { onUnrecoverable });
    await conn.createOffer();
    const pc = FakePeerConnection.instances[0];

    // Every restart lands back in `failed` — a network that is simply down.
    // The connection has to stop and say so; the previous code reset its
    // attempt counter on each restart and retried at 500ms indefinitely.
    for (let i = 0; i < 10; i += 1) {
      pc.setIceState("failed");
      await settle();
    }

    expect(pc.restarts).toBe(5);
    expect(onUnrecoverable).toHaveBeenCalled();
  });

  it("does not refill the budget when a restart merely reaches `checking`", async () => {
    const onUnrecoverable = vi.fn();
    const conn = new DuxoConnection(iceConfig, { onUnrecoverable });
    await conn.createOffer();
    const pc = FakePeerConnection.instances[0];

    // An ICE restart always passes through `checking` on its way back to
    // `failed`. Treating that as a recovery made the budget unspendable.
    for (let i = 0; i < 10; i += 1) {
      pc.setIceState("failed");
      await settle();
      pc.setIceState("checking");
    }

    expect(pc.restarts).toBe(5);
    expect(onUnrecoverable).toHaveBeenCalled();
  });

  it("restores the full budget once the connection actually comes back", async () => {
    const onRecovering = vi.fn();
    const onRecovered = vi.fn();
    const onUnrecoverable = vi.fn();
    const conn = new DuxoConnection(iceConfig, {
      onRecovering,
      onRecovered,
      onUnrecoverable,
    });
    await conn.createOffer();
    const pc = FakePeerConnection.instances[0];

    pc.setIceState("failed");
    await settle();
    expect(onRecovering).toHaveBeenCalledWith(1, 5);

    pc.setIceState("connected");
    expect(onRecovered).toHaveBeenCalledTimes(1);

    // A drop hours later is a fresh five attempts, not the sixth.
    pc.setIceState("failed");
    await settle();
    expect(onRecovering).toHaveBeenLastCalledWith(1, 5);
    expect(onUnrecoverable).not.toHaveBeenCalled();
  });

  it("reports recovery only after an actual reconnect", async () => {
    const onRecovered = vi.fn();
    const conn = new DuxoConnection(iceConfig, { onRecovered });
    await conn.createOffer();
    const pc = FakePeerConnection.instances[0];

    // The first successful connect is not a recovery.
    pc.setIceState("connected");
    expect(onRecovered).not.toHaveBeenCalled();
  });

  it("republishes the restart offer so the host can answer it", async () => {
    const onIceRestartOffer = vi.fn();
    const conn = new DuxoConnection(iceConfig, { onIceRestartOffer });
    await conn.createOffer();
    const pc = FakePeerConnection.instances[0];

    pc.setIceState("failed");
    await vi.advanceTimersByTimeAsync(600);

    // §1.3 #4 — a restart that never reaches RTDB is not a restart at all.
    expect(onIceRestartOffer).toHaveBeenCalledWith(
      expect.objectContaining({ type: "offer", sdp: "offer-2" }),
    );
  });
});

describe("setRemoteAnswer", () => {
  it("applies the answer that completes an outstanding offer", async () => {
    const conn = new DuxoConnection(iceConfig, {});
    await conn.createOffer();
    const pc = FakePeerConnection.instances[0];

    await expect(
      conn.setRemoteAnswer({ type: "answer", sdp: "answer-1" }),
    ).resolves.toBe(true);
    expect(pc.remoteDescription).toEqual({ type: "answer", sdp: "answer-1" });
  });

  it("ignores an answer re-delivered while already stable", async () => {
    const conn = new DuxoConnection(iceConfig, {});
    await conn.createOffer();
    await conn.setRemoteAnswer({ type: "answer", sdp: "answer-1" });

    // RTDB re-sends the whole session node on every child write, so the same
    // answer arrives again with each ICE candidate. Re-applying it throws.
    await expect(
      conn.setRemoteAnswer({ type: "answer", sdp: "answer-1" }),
    ).resolves.toBe(false);
  });

  it("applies the second answer produced by an ICE restart", async () => {
    const conn = new DuxoConnection(iceConfig, {});
    await conn.createOffer();
    await conn.setRemoteAnswer({ type: "answer", sdp: "answer-1" });
    const pc = FakePeerConnection.instances[0];

    pc.setIceState("failed");
    await vi.advanceTimersByTimeAsync(600);

    await expect(
      conn.setRemoteAnswer({ type: "answer", sdp: "answer-2" }),
    ).resolves.toBe(true);
    expect(pc.remoteDescription).toEqual({ type: "answer", sdp: "answer-2" });
  });
});

/**
 * §0.6 — trickle ICE has no ordering guarantee between the host's answer and
 * the candidates it gathers. RTDB delivers whatever the host wrote first, so
 * a host that trickles early sends candidates the browser cannot apply yet.
 *
 * `addIceCandidate` rejects with InvalidStateError while there is no remote
 * description. The rejection used to be swallowed, and app/session/page.tsx
 * marks each candidate index consumed the moment it reads it — so a dropped
 * candidate was never re-offered. The browser silently lost its peer's
 * candidates and the connection came up only if a later batch happened to be
 * enough.
 */
describe("§0.6 candidates arriving before the answer", () => {
  it("holds early candidates instead of dropping them", async () => {
    const conn = new DuxoConnection(iceConfig, {});
    await conn.createOffer();
    const pc = FakePeerConnection.instances[0];

    conn.addIceCandidates([{ candidate: "early-1" }, { candidate: "early-2" }]);
    // Nothing applied yet — there is no remote description to attach to.
    expect(pc.addedCandidates).toHaveLength(0);

    await conn.setRemoteAnswer({ type: "answer", sdp: "answer-1" });

    expect(pc.addedCandidates.map((c) => c.candidate)).toEqual([
      "early-1",
      "early-2",
    ]);
  });

  it("applies candidates directly once the answer is in", async () => {
    const conn = new DuxoConnection(iceConfig, {});
    await conn.createOffer();
    const pc = FakePeerConnection.instances[0];
    await conn.setRemoteAnswer({ type: "answer", sdp: "answer-1" });

    conn.addIceCandidates([{ candidate: "late-1" }]);
    await Promise.resolve();

    expect(pc.addedCandidates.map((c) => c.candidate)).toEqual(["late-1"]);
  });

  it("does not replay the buffer on a second answer", async () => {
    // An ICE restart produces a second answer for the same session. The
    // already-drained buffer must not be applied again.
    const conn = new DuxoConnection(iceConfig, {});
    await conn.createOffer();
    const pc = FakePeerConnection.instances[0];

    conn.addIceCandidates([{ candidate: "early-1" }]);
    await conn.setRemoteAnswer({ type: "answer", sdp: "answer-1" });
    expect(pc.addedCandidates).toHaveLength(1);

    await conn.restartIce();
    await conn.setRemoteAnswer({ type: "answer", sdp: "answer-2" });

    expect(pc.addedCandidates).toHaveLength(1);
  });

  it("drops the buffer on close rather than leaking it", async () => {
    const conn = new DuxoConnection(iceConfig, {});
    await conn.createOffer();
    const pc = FakePeerConnection.instances[0];

    conn.addIceCandidates([{ candidate: "early-1" }]);
    conn.close();

    // Nothing was applied, and nothing is retained to apply later.
    expect(pc.addedCandidates).toHaveLength(0);
    conn.addIceCandidates([{ candidate: "after-close" }]);
    expect(pc.addedCandidates).toHaveLength(0);
  });
});
