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
}

// §1.3 — exponential backoff for ICE restart (matches §6.5 KPI: <10s local,
// <15s via TURN). Cap at 8s per attempt.
const BACKOFF_DELAYS_MS = [500, 1000, 2000, 4000, 8000];

export class DuxoConnection {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private events: ConnectionEvents;
  private iceServers: RTCIceServer[];
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
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

  /** True until the host's answer has been applied. */
  needsAnswer(): boolean {
    return this.pc !== null && this.pc.remoteDescription === null;
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

  /** §1.6-B — host returns the answer. */
  async setRemoteAnswer(answer: RTCSessionDescriptionInit) {
    if (!this.pc) throw new Error("PeerConnection not initialized");
    await this.pc.setRemoteDescription(answer);
  }

  /** §0.6 — batched ICE candidates (max 10 per write). */
  addIceCandidates(candidates: RTCIceCandidateInit[]) {
    if (!this.pc) return;
    for (const c of candidates) {
      void this.pc.addIceCandidate(c).catch(() => {
        // §1.3 — transient candidate errors shouldn't tear down the session.
      });
    }
  }

  /** §1.4 — send a tagged-JSON message over the data channel. */
  send(message: Record<string, unknown>) {
    if (this.dc && this.dc.readyState === "open") {
      this.dc.send(JSON.stringify(message));
    }
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
      this.reconnectAttempts = 0;
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
      this.events.onStateChange?.("failed");
      return;
    }
    const delay = BACKOFF_DELAYS_MS[this.reconnectAttempts];
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      void this.restartIce();
    }, delay);
  }

  private attachListeners() {
    if (!this.pc) return;

    this.pc.onconnectionstatechange = () => {
      this.events.onStateChange?.(this.pc!.connectionState);
    };

    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc!.iceConnectionState;
      this.events.onIceStateChange?.(state);

      switch (state) {
        case "checking":
        case "connected":
        case "completed":
          this.reconnectAttempts = 0;
          if (state === "connected") this.startPingLoop();
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
      this.pc.oniceconnectionstatechange = null;
      this.pc.onconnectionstatechange = null;
      this.pc.close();
    }
    this.dc = null;
    this.pc = null;
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
