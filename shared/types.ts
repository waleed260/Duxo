/**
 * Duxo — Shared types between the viewer (Next.js/TS) and host agent.
 *
 * These mirror the Rust enums/structs in host-agent/src/types.rs so the two
 * sides never drift on string values ("allowed" vs "Allowed" bug class, §1.1).
 */

// §1.1 Session State Machine — must match RTDB `.validate` rules (§10.2).
export type SessionStatus =
  | "waiting"
  | "requested"
  | "allowed"
  | "denied"
  | "connecting"
  | "active"
  | "ended"
  | "expired";

// §0.6 hostPlatform values — also referenced in RTDB rules.
export type HostPlatform =
  | "windows"
  | "linux-x11"
  | "linux-wayland";

// §6.1 protocol versioning — every session-init payload carries this.
export type ProtocolVersion = `${number}.${number}.${number}`;

// §6.1 capability flags — negotiated down rather than failing the session.
export type Capability =
  | "clipboard"
  | "file_transfer"
  | "quality_indicator";

// §10.4 — RTDB live session node (signaling only, never durable).
export interface Session {
  hostId: string;
  hostPlatform: HostPlatform;
  viewerId: string | null;
  status: SessionStatus;
  offer: string | null;
  answer: string | null;
  hostCandidates: Record<string, string>;
  viewerCandidates: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

// §6.1 — viewer declares supported protocol range on REQUESTED.
export interface SessionInit {
  protocolVersion: ProtocolVersion;
  capabilities: Capability[];
}

// §10.4 — TS view of the RTDB status enum (kept separate from Session
// for the rare case where we read just the status child).
export type { SessionStatus as RtdbStatus };

// §6.3 — Firestore durable record types (low-frequency, post-session).
export interface UserProfile {
  email: string;
  displayName: string;
  emailVerified: boolean;
  createdAt: number;
  totpEnabled: boolean;
  totpSecretEncrypted: string | null;
}

export interface DeviceRecord {
  ownerUid: string;
  platform: HostPlatform;
  lastSeenAt: number;
  appVersion: string;
  protocolVersion: ProtocolVersion;
}

export type EndReason = "user_ended" | "timeout" | "error" | "crash";

export interface SessionHistoryRecord {
  hostUid: string;
  viewerUid: string;
  hostPlatform: HostPlatform;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  endReason: EndReason;
}

export type AuditAction =
  | "login"
  | "session_start"
  | "session_end"
  | "permission_denied"
  | "totp_enabled";

export interface AuditLogEntry {
  uid: string;
  action: AuditAction;
  timestamp: number;
  metadata: Record<string, unknown>;
  // §7.3 — SHA-256 hash of the previous entry, forming a hash chain.
  // Detectable tamper-evidence without a paid log-integrity service.
  prevHash: string | null;
}

// §1.4 — Data channel message envelope.
// Single ordered, reliable channel, tagged JSON, debuggable by eye.
export interface DataChannelMessage {
  type: string;
  t?: number;
  [key: string]: unknown;
}

export interface MouseMoveMessage extends DataChannelMessage {
  type: "mouse_move";
  // Normalized 0–1 floats — avoids multi-resolution/multi-DPI bugs (§1.4).
  x: number;
  y: number;
}

export interface MouseClickMessage extends DataChannelMessage {
  type: "mouse_click";
  button: "left" | "right" | "middle";
  state: "down" | "up";
}

export interface KeyEventMessage extends DataChannelMessage {
  type: "key_event";
  // Physical-key code (KeyboardEvent.code) — layout-independent.
  code: string;
  state: "down" | "up";
}

export interface ClipboardTextMessage extends DataChannelMessage {
  type: "clipboard_text";
  data: string;
}

export interface FileChunkMessage extends DataChannelMessage {
  type: "file_chunk";
  fileId: string;
  index: number;
  total: number;
  // ~16KB per chunk — practical DataChannel limit before browser buffering (§1.4).
  // Cap total file size at 10MB, enforced BEFORE the transfer starts.
  data: string;
}

export interface PingMessage extends DataChannelMessage {
  type: "ping";
}

export interface PongMessage extends DataChannelMessage {
  type: "pong";
  // RTT doubles as the connection-quality indicator (§4 roadmap Phase 4).
  rtt_ms: number;
}

// §0.5 — ICE server priority order: STUN → Metered TURN → Oracle Coturn (Path B).
export interface IceServerConfig {
  stunUrls: string[];
  turnUrls: string[];
  turnUsername?: string;
  turnCredential?: string;
}
