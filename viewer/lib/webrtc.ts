/**
 * Duxo — WebRTC viewer-side connection manager.
 *
 * Implements §1.3 connection lifecycle:
 *   1. Initial connect — STUN → Metered TURN → Oracle Coturn (Path B) priority.
 *   2. State monitoring — checking → connected → disconnected → failed → closed.
 *   3. Transient drop (disconnected) — DON'T tear down, WebRTC self-recovers in
 *      10-20s. Only act on `failed`.
 *   4. Hard failure — ICE restart via createOffer({iceRestart:true}), same
 *      sessionId (not a new code). Difference between "3s reconnect" and
 *      "re-enter your 8-digit code mid-support-call".
 *   5. Total failure — surface a clear UI message, log locally (§1.6).
 *
 * Data channel protocol §1.4: tagged JSON envelope, normalized 0-1 mouse
 * coordinates, ping/pong doubles as quality indicator.
 */
import type { IceServerConfig } from "@shared/types";

export interface ConnectionEvents {
  onStateChange?: (state: RTCPeerConnectionState) => void;
  onIceStateChange?: (state: RTCIceConnectionState) => void;
  onDataChannelOpen?: () => void;
  onDataChannelClose?: () => void;
  onDataChannelMessage?: (data: unknown) => void;
  onTrack?: (stream: MediaStream) => void;
  onQualityUpdate?: (rttMs: number) => void;
  /**
   * §1.3 #4/#5 — recovery is under way (`failed` was observed and an ICE
   * restart is scheduled), and then whether it worked. `RTCPeerConnection`
   * reports `failed` the moment ICE gives up, which is the *start* of the
   * recovery §1.3 describes, not the end of it: a UI that treats that state
   * as final tells the user to re-enter their code while the fix is in
   * flight. Only `onUnrecoverable` is final.
   */
  onRecovering?: (attempt: number, ofAttempts: number) => void;
  onRecovered?: () => void;
  /** §1.3 #5 — every ICE restart is spent. This one is worth surfacing. */
  onUnrecoverable?: () => void;
  /**
   * §0.6 — trickle ICE. Fires once per locally gathered candidate; the caller
   * batches these into `sessions/{id}/viewerCandidates` (max 10 per write).
   * Without this the host never learns how to reach the browser and the
   * connection can only ever succeed on a same-LAN host-candidate fluke.
   */
  onIceCandidate?: (candidate: RTCIceCandidateInit) => void;
  /** §1.3 #4 — a new local offer was produced by an ICE restart. */
  onIceRestartOffer?: (offer: RTCSessionDescriptionInit) => void;
}

// §1.3 — exponential backoff for ICE restart (matches §6.5 KPI: <10s local,
// <15s via TURN). Cap at 8s per attempt.
const BACKOFF_DELAYS_MS = [500, 1000, 2000, 4000, 8000];

export type MouseButtonName = "left" | "middle" | "right";

/** DOM `MouseEvent.button` → the §1.4 wire name. */
export function mouseButtonName(button: number): MouseButtonName {
  if (button === 1) return "middle";
  if (button === 2) return "right";
  return "left";
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export class DuxoConnection {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private events: ConnectionEvents;
  private iceServers: RTCIceServer[];
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Candidates received before a remote description existed to apply them to. */
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastPingT = 0;

  constructor(config: IceServerConfig, events: ConnectionEvents) {
    this.events = events;
    // §0.5 — priority order: STUN first, TURN as fallback.
    this.iceServers = [
      { urls: config.stunUrls },
      {
        urls: config.turnUrls,
        username: config.turnUsername,
        credential: config.turnCredential,
      },
    ].filter((s) => "urls" in s && (s.urls as string[]).length > 0);
  }

  /** True once the peer connection exists (offer created). */
  hasPeer(): boolean {
    return this.pc !== null;
  }

  /** §1.6-B — viewer creates the offer (we are the controlling peer here). */
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    this.pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.attachListeners();

    // §1.4 — single ordered, reliable data channel for input/clipboard/files.
    this.dc = this.pc.createDataChannel("duxo", {
      ordered: true,
    });
    this.attachDataChannel(this.dc);

    // §0.5 — receive the host's video track (the remote screen).
    this.pc.ontrack = (e) => {
      this.events.onTrack?.(e.streams[0]);
    };

    const offer = await this.pc.createOffer({
      offerToReceiveVideo: true,
      offerToReceiveAudio: false, // audio deferred to Phase 5.
    });
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  /**
   * §1.6-B — host returns the answer. Also §1.3 #4: after an ICE restart the
   * host publishes a *second* answer for the same session, and it has to be
   * applied like the first.
   *
   * Returns false when there is no outstanding offer for this answer to
   * complete. That is the normal case for a re-delivered answer — RTDB
   * re-sends the whole session node on every change, so the same answer
   * arrives again whenever a candidate is written — and calling
   * `setRemoteDescription` in `stable` would throw `InvalidStateError`.
   */
  async setRemoteAnswer(answer: RTCSessionDescriptionInit): Promise<boolean> {
    if (!this.pc) throw new Error("PeerConnection not initialized");
    if (this.pc.signalingState !== "have-local-offer") return false;
    await this.pc.setRemoteDescription(answer);
    this.flushPendingCandidates();
    return true;
  }

  /**
   * §0.6 — batched ICE candidates (max 10 per write).
   *
   * Candidates that arrive before the answer are held, not dropped.
   * `addIceCandidate` rejects with InvalidStateError while there is no remote
   * description, and trickle ICE gives no ordering guarantee between the
   * host's answer and the candidates it gathers — RTDB delivers whatever the
   * host wrote first. The caller marks each candidate index consumed the
   * moment it reads it, so anything rejected here was gone for good: on a
   * host that trickled early, the browser would silently lose its peer's
   * candidates and the connection would come up only if a later batch
   * happened to be enough, or not at all.
   */
  addIceCandidates(candidates: RTCIceCandidateInit[]) {
    if (!this.pc) return;
    if (!this.pc.remoteDescription) {
      this.pendingCandidates.push(...candidates);
      return;
    }
    for (const c of candidates) {
      void this.pc.addIceCandidate(c).catch(() => {
        // A genuinely malformed candidate should not tear down the session;
        // the remaining ones can still produce a working pair.
      });
    }
  }

  /** Drain candidates buffered before the remote description existed. */
  private flushPendingCandidates() {
    if (!this.pc || this.pendingCandidates.length === 0) return;
    const queued = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const c of queued) {
      void this.pc.addIceCandidate(c).catch(() => {});
    }
  }

  /** §1.4 — send a tagged-JSON message over the data channel. */
  send(message: Record<string, unknown>) {
    if (this.dc && this.dc.readyState === "open") {
      this.dc.send(JSON.stringify(message));
    }
  }

  /** True once the host has accepted the data channel. */
  isChannelOpen(): boolean {
    return this.dc?.readyState === "open";
  }

  /**
   * §1.4 — mouse move. Coordinates are normalized 0–1 floats, never pixels,
   * so a 1440p viewer window driving a 1080p host needs no scaling math and
   * no DPI correction.
   */
  sendMouseMove(x: number, y: number) {
    this.send({ type: "mouse_move", x: clamp01(x), y: clamp01(y), t: Date.now() });
  }

  sendMouseClick(button: MouseButtonName, state: "down" | "up") {
    this.send({ type: "mouse_click", button, state, t: Date.now() });
  }

  /** Wheel deltas stay in host-independent "notch" units (§1.4 extension). */
  sendMouseScroll(dx: number, dy: number) {
    this.send({ type: "mouse_scroll", dx, dy, t: Date.now() });
  }

  /** §1.4 — physical key code (KeyboardEvent.code), layout-independent. */
  sendKeyEvent(code: string, state: "down" | "up") {
    this.send({ type: "key_event", code, state, t: Date.now() });
  }

  /**
   * §1.3 #4 / §6.2 — ICE restart. Re-exchanges through RTDB using the SAME
   * session ID, not a new code.
   */
  async restartIce(): Promise<RTCSessionDescriptionInit | null> {
    if (!this.pc) return null;
    try {
      const offer = await this.pc.createOffer({ iceRestart: true });
      await this.pc.setLocalDescription(offer);
      // The attempt counter is NOT reset here. Producing an offer is not
      // reconnecting — only ICE reaching `connected` is, and that resets it
      // in `oniceconnectionstatechange`. Resetting on the attempt itself made
      // the backoff a fixed 500ms retry with no end, so §1.3 #5's "total
      // failure, surface a clear message" was unreachable.
      // §1.3 #4 — the restart is only real once the new offer is re-published
      // through RTDB under the SAME session id. Hand it to the caller.
      this.events.onIceRestartOffer?.(offer);
      return offer;
    } catch {
      this.scheduleReconnect();
      return null;
    }
  }

  /**
   * §1.3 #3 — transient drops self-recover. §1.3 #4 — only `failed` triggers
   * reconnect-with-backoff. Don't tear down on `disconnected`.
   */
  private scheduleReconnect() {
    if (this.reconnectAttempts >= BACKOFF_DELAYS_MS.length) {
      // §1.3 #5 — total failure. Surface clear UI message.
      this.events.onUnrecoverable?.();
      return;
    }
    const delay = BACKOFF_DELAYS_MS[this.reconnectAttempts];
    this.reconnectAttempts += 1;
    this.events.onRecovering?.(this.reconnectAttempts, BACKOFF_DELAYS_MS.length);
    this.reconnectTimer = setTimeout(() => {
      void this.restartIce();
    }, delay);
  }

  private attachListeners() {
    if (!this.pc) return;

    // §0.6 — trickle our candidates out as they are gathered. A null
    // candidate marks end-of-gathering and is not forwarded.
    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.events.onIceCandidate?.(e.candidate.toJSON());
      }
    };

    this.pc.onconnectionstatechange = () => {
      this.events.onStateChange?.(this.pc!.connectionState);
    };

    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc!.iceConnectionState;
      this.events.onIceStateChange?.(state);

      switch (state) {
        case "connected":
        case "completed":
          // Only a connection that actually came up clears the budget.
          // `checking` used to clear it too, and an ICE restart always passes
          // through `checking` on its way back to `failed` — so the budget
          // was refilled by the very failure it was meant to bound.
          if (this.reconnectAttempts > 0) this.events.onRecovered?.();
          this.reconnectAttempts = 0;
          if (state === "connected") this.startPingLoop();
          break;
        case "checking":
          break;
        case "disconnected":
          // §1.3 #3 — DON'T tear down. Self-recovers in 10-20s.
          break;
        case "failed":
          // §1.3 #4 — hard failure → ICE restart with backoff.
          this.scheduleReconnect();
          break;
        case "closed":
          this.stopPingLoop();
          break;
      }
    };
  }

  private attachDataChannel(dc: RTCDataChannel) {
    dc.onopen = () => {
      this.events.onDataChannelOpen?.();
      this.startPingLoop();
    };
    dc.onclose = () => {
      this.events.onDataChannelClose?.();
      this.stopPingLoop();
    };
    dc.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        // §1.4 — ping/pong doubles as the connection-quality indicator.
        if (msg.type === "pong" && typeof msg.rtt_ms === "number") {
          this.events.onQualityUpdate?.(msg.rtt_ms);
        } else {
          this.events.onDataChannelMessage?.(msg);
        }
      } catch {
        // Forward-compat: ignore messages we can't parse (§6.1).
      }
    };
  }

  // §1.4 — ping loop; host responds with {type:"pong", t, rtt_ms}.
  private startPingLoop() {
    this.stopPingLoop();
    this.pingTimer = setInterval(() => {
      this.lastPingT = Date.now();
      this.send({ type: "ping", t: this.lastPingT });
    }, 5000);
  }

  private stopPingLoop() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /** Clean shutdown — RTDB session node gets ENDED by either peer (§1.1). */
  close() {
    this.stopPingLoop();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.dc) {
      this.dc.onopen = null;
      this.dc.onclose = null;
      this.dc.onmessage = null;
      this.dc.close();
    }
    if (this.pc) {
      this.pc.ontrack = null;
      this.pc.onicecandidate = null;
      this.pc.oniceconnectionstatechange = null;
      this.pc.onconnectionstatechange = null;
      this.pc.close();
    }
    this.dc = null;
    this.pc = null;
    this.pendingCandidates = [];
  }
}

// §0.5 — default ICE server config. STUN = Google public, TURN = Metered.ca.
export function defaultIceServers(): IceServerConfig {
  return {
    stunUrls: ["stun:stun.l.google.com:19302"],
    turnUrls: (process.env.NEXT_PUBLIC_METERED_TURN_URLS ?? "")
      .split(",")
      .filter(Boolean),
    turnUsername: process.env.NEXT_PUBLIC_METERED_TURN_USERNAME,
    turnCredential: process.env.NEXT_PUBLIC_METERED_TURN_CREDENTIAL,
  };
}
