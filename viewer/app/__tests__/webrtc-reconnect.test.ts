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

  async addIceCandidate() {}
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
