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
            "waiting",
            "requested",
            "allowed",
            "denied",
            "connecting",
            "active",
            "ended",
            "expired",
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
        Self {
            major: 1,
            minor: 0,
            patch: 0,
        }
    }
}

impl ProtocolVersion {
    /// §6.1 — Parse a "major.minor.patch" string.
    ///
    /// A malformed version is its own failure, not a JSON failure: constructing
    /// a `serde_json::Error` by hand needs `serde::de::Error` in scope and
    /// mislabels the cause in every log line it reaches.
    pub fn parse(s: &str) -> Result<Self> {
        let parts: Vec<&str> = s.split('.').collect();
        if parts.len() != 3 {
            return Err(DuxoError::Protocol(format!(
                "expected major.minor.patch, got {s:?}"
            )));
        }
        let parse_part = |part: &str, which: &str| -> Result<u32> {
            part.parse::<u32>()
                .map_err(|_| DuxoError::Protocol(format!("invalid {which} version {part:?}")))
        };
        Ok(Self {
            major: parse_part(parts[0], "major")?,
            minor: parse_part(parts[1], "minor")?,
            patch: parse_part(parts[2], "patch")?,
        })
    }
}

impl std::fmt::Display for ProtocolVersion {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}.{}.{}", self.major, self.minor, self.patch)
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

    // §0.5 — webrtc-rs carries compressed media only; it does no encoding of
    // its own, so VP8 compression is a stage the host agent owns (encoder.rs).
    #[error("Video encoder error: {0}")]
    Encoder(String),

    #[error("WebRTC error: {0}")]
    WebRtc(String),

    #[error("Not signed in — link this device from the Duxo web app first")]
    NotAuthenticated,

    // §6.1 — protocol version parsing and capability negotiation.
    #[error("Protocol error: {0}")]
    Protocol(String),

    #[error("Screen capture error: {0}")]
    Capture(String),

    #[error("Input injection error: {0}")]
    Input(String),

    /// Native window failures (§2.4 Allow/Deny, §3.4 code display).
    ///
    /// Deliberately a concrete error rather than `Box<dyn Error>`: the tray
    /// handles these inside a spawned task, and `Box<dyn Error>` is not `Send`,
    /// so holding one across an await makes the whole future unspawnable.
    #[error("Window error: {0}")]
    Window(String),

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

#[cfg(test)]
mod tests {
    use super::*;

    /// §10.2 — the RTDB `status` rule is a hard-coded list of strings. If the
    /// enum and that list ever disagree, the host writes a status the rules
    /// reject and the session stalls in whatever state it was already in,
    /// with nothing but a 401 in a log to say why. This is the check that
    /// keeps `valid_values` honest against `Display`.
    #[test]
    fn every_status_serialises_to_a_value_the_rtdb_rule_admits() {
        let all = [
            SessionStatus::Waiting,
            SessionStatus::Requested,
            SessionStatus::Allowed,
            SessionStatus::Denied,
            SessionStatus::Connecting,
            SessionStatus::Active,
            SessionStatus::Ended,
            SessionStatus::Expired,
        ];
        let allowed = SessionStatus::valid_values();
        assert_eq!(
            all.len(),
            allowed.len(),
            "a variant was added to SessionStatus without adding it to \
             valid_values() and to firebase/database.rules.json"
        );
        for status in all {
            let wire = status.to_string();
            assert!(
                allowed.contains(&wire.as_str()),
                "{wire:?} is not in the RTDB status rule"
            );
        }
    }

    #[test]
    fn protocol_version_round_trips() {
        let v = ProtocolVersion::parse("1.2.0").expect("valid");
        assert_eq!((v.major, v.minor, v.patch), (1, 2, 0));
        assert_eq!(v.to_string(), "1.2.0");
    }

    #[test]
    fn malformed_protocol_versions_are_rejected() {
        for bad in ["1.2", "1.2.0.1", "a.b.c", "", "1.2.x"] {
            assert!(
                ProtocolVersion::parse(bad).is_err(),
                "{bad:?} should not parse"
            );
        }
    }

    /// §0.2 — Wayland is view-only; this is the check `backend::platform_input`
    /// consults before it hands out an input backend at all.
    #[test]
    fn wayland_does_not_support_remote_input() {
        assert!(HostPlatform::Windows.supports_remote_input());
        assert!(HostPlatform::LinuxX11.supports_remote_input());
        assert!(!HostPlatform::LinuxWayland.supports_remote_input());
    }
}
