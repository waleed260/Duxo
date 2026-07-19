//! Duxo host agent — core types.
//!
//! §1.1 — Session state machine as an explicit enum, NOT loose string
//! comparisons. A mismatched string ("Allowed" vs "allowed") is a real,
//! common bug class in exactly this kind of RTDB-driven app.
//!
//! §6.1 — protocol versioning tied to wire format, not just app version.
//! §10.3b — error types, retry/backoff, data channel dispatch.

use serde::{Deserialize, Serialize};

/// §1.1 session state machine. Must match the TS type in shared/types.ts and
/// the RTDB `.validate` rule in §10.2 exactly.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SessionStatus {
    Waiting,
    Requested,
    Allowed,
    Denied,
    Connecting,
    Active,
    Ended,
    Expired,
}

impl SessionStatus {
    /// §10.2 — these are the only valid values the RTDB rule allows.
    pub fn valid_values() -> &'static [&'static str] {
        &[
            "waiting", "requested", "allowed", "denied",
            "connecting", "active", "ended", "expired",
        ]
    }
}

impl std::fmt::Display for SessionStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = serde_json::to_string(self).unwrap_or_else(|_| "unknown".into());
        write!(f, "{}", s.trim_matches('"'))
    }
}

/// §6.3 — host platform values. Must match shared/types.ts HostPlatform.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum HostPlatform {
    Windows,
    LinuxX11,
    LinuxWayland,
}

impl HostPlatform {
    /// Detect the current platform at runtime.
    pub fn detect() -> Self {
        #[cfg(target_os = "windows")]
        {
            HostPlatform::Windows
        }
        #[cfg(target_os = "linux")]
        {
            // Check if WAYLAND_DISPLAY is set.
            if std::env::var("WAYLAND_DISPLAY").is_ok() {
                HostPlatform::LinuxWayland
            } else {
                HostPlatform::LinuxX11
            }
        }
        #[cfg(not(any(target_os = "windows", target_os = "linux")))]
        {
            compile_error!("Unsupported platform — Duxo host agent targets Windows and Linux only.")
        }
    }

    /// §0.2 — Wayland = view-only in MVP.
    pub fn supports_remote_input(&self) -> bool {
        matches!(self, HostPlatform::Windows | HostPlatform::LinuxX11)
    }
}

impl std::fmt::Display for HostPlatform {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Windows => write!(f, "windows"),
            Self::LinuxX11 => write!(f, "linux-x11"),
            Self::LinuxWayland => write!(f, "linux-wayland"),
        }
    }
}

/// §6.1 — protocol version, semantic versioning tied to the wire protocol.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProtocolVersion {
    pub major: u32,
    pub minor: u32,
    pub patch: u32,
}

impl Default for ProtocolVersion {
    fn default() -> Self {
        Self { major: 1, minor: 0, patch: 0 }
    }
}

impl ProtocolVersion {
    /// §6.1 — Parse a "major.minor.patch" string.
    pub fn parse(s: &str) -> Result<Self> {
        let parts: Vec<&str> = s.split('.').collect();
        if parts.len() != 3 {
            return Err(DuxoError::Json(serde_json::Error::custom("invalid protocol version format")));
        }
        let major = parts[0].parse::<u32>()
            .map_err(|_| DuxoError::Json(serde_json::Error::custom("invalid major version")))?;
        let minor = parts[1].parse::<u32>()
            .map_err(|_| DuxoError::Json(serde_json::Error::custom("invalid minor version")))?;
        let patch = parts[2].parse::<u32>()
            .map_err(|_| DuxoError::Json(serde_json::Error::custom("invalid patch version")))?;
        Ok(Self { major, minor, patch })
    }
}

impl std::fmt::Display for ProtocolVersion {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}.{}.{}", self.major, self.minor, self.patch)
    }
}

/// §1.4 — data channel message envelope (tagged JSON).
/// Forward-compat: unhandled message types are logged, never panicked (§10.3b).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataChannelMessage {
    #[serde(rename = "type")]
    pub msg_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub t: Option<i64>,
    /// Remaining fields stored as raw JSON for flexible dispatch.
    #[serde(flatten)]
    pub extra: serde_json::Value,
}

/// Live session context — held in memory while the WebRTC connection is active.
#[derive(Debug, Clone)]
pub struct SessionContext {
    pub session_id: String,
    pub status: SessionStatus,
    pub host_platform: HostPlatform,
    pub viewer_id: Option<String>,
    pub verified_viewer_email: Option<String>,  // From JWT claims, NOT from RTDB (§2.5).
    pub protocol_version: ProtocolVersion,
    pub created_at: i64,
}

impl SessionContext {
    /// §2.4 / §10.3 — the single most important security gate.
    /// Never auto-accept. Never inject input before this returns true.
    pub fn can_open_data_channel(&self, verified_viewer_uid: &str) -> bool {
        self.status == SessionStatus::Allowed
            && self.viewer_id.as_deref() == Some(verified_viewer_uid)
            && !self.is_expired()
    }

    /// §0.7 — 24-hour expiry check.
    pub fn is_expired(&self) -> bool {
        let now = chrono::Utc::now().timestamp_millis();
        (now - self.created_at) > 24 * 60 * 60 * 1000
    }

    /// §7.2 — Clear sensitive data from memory when a session ends.
    /// Called when the session transitions to ENDED or EXPIRED.
    pub fn zeroize(&mut self) {
        use zeroize::Zeroize;
        self.session_id.zeroize();
        if let Some(ref mut id) = self.viewer_id {
            id.zeroize();
        }
        if let Some(ref mut email) = self.verified_viewer_email {
            email.zeroize();
        }
    }
}

/// §10.3b — unified error type. Every Rust module returns this so callers
/// match explicitly rather than unwrap().
#[derive(Debug, thiserror::Error)]
pub enum DuxoError {
    #[error("Firebase ID token expired")]
    TokenExpired,

    #[error("Invalid JWT signature")]
    TokenInvalidSignature,

    #[error("Unknown signing key (kid not in Google certs)")]
    UnknownSigningKey,

    #[error("JWT missing kid header")]
    MissingKeyId,

    #[error("Session not found")]
    SessionNotFound,

    #[error("Session expired")]
    SessionExpired,

    #[error("Viewer UID mismatch — potential spoofing attempt")]
    ViewerMismatch,

    #[error("ICE connection failed after {attempts} attempts")]
    IceConnectionFailed { attempts: u8 },

    #[error("ICE restart exhausted")]
    IceRestartExhausted { attempts: u8 },

    #[error("Data channel closed")]
    DataChannelClosed,

    #[error("Capture backend unavailable for this platform")]
    CaptureBackendUnavailable,

    #[error("Firebase/RTDB error: {0}")]
    Firebase(String),

    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

/// Result alias used throughout the host agent.
pub type Result<T> = std::result::Result<T, DuxoError>;
