//! Duxo session state machine — §1.1.
//!
//! Every remote session moves through one strict state machine, enforced
//! both in RTDB rules (server-side truth) and in the host agent (client-side
//! gate). Never trust the viewer's browser to self-report a state.
//!
//! CREATED ──► WAITING ──► REQUESTED ──► ┬─► ALLOWED ──► CONNECTING ──►
//! ACTIVE ──► ENDED
//!                                        └─► DENIED ──► CLOSED
//!
//! Any state ──(24h timeout)──► EXPIRED
//! ACTIVE ──(30 min idle OR network loss > 60s)──► ENDED

use crate::types::{DuxoError, ProtocolVersion, Result, SessionStatus};
use serde::{Deserialize, Serialize};

/// §6.1 — Protocol version declared by the host for capability negotiation.
pub const HOST_PROTOCOL_VERSION: ProtocolVersion = ProtocolVersion {
    major: 1,
    minor: 2,
    patch: 0,
};

/// §6.1 — The set of capabilities the host supports.
/// Used to negotiate down with older viewers.
pub const SUPPORTED_CAPABILITIES: &[&str] = &["clipboard", "file_transfer", "quality_indicator"];

/// §6.1 — Viewer's declared protocol range from the session request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViewerProtocolDecl {
    pub protocol_version: String,
    pub capabilities: Vec<String>,
}

/// Valid state transitions per §1.1. Returns Err if the transition is illegal.
pub fn transition(current: SessionStatus, next: SessionStatus) -> Result<SessionStatus> {
    match (current, next) {
        // Happy path
        (SessionStatus::Waiting, SessionStatus::Requested)
        | (SessionStatus::Requested, SessionStatus::Allowed)
        | (SessionStatus::Requested, SessionStatus::Denied)
        | (SessionStatus::Allowed, SessionStatus::Connecting)
        | (SessionStatus::Connecting, SessionStatus::Active)
        | (SessionStatus::Denied, SessionStatus::Ended)
        | (SessionStatus::Ended, SessionStatus::Ended)
        | (SessionStatus::Ended, SessionStatus::Waiting) => {
            tracing::info!(
                from = %current, to = %next,
                "state transition (legal)"
            );
            Ok(next)
        }

        // §1.1 — timeout paths
        (SessionStatus::Waiting, SessionStatus::Expired)
        | (SessionStatus::Requested, SessionStatus::Expired)
        | (SessionStatus::Allowed, SessionStatus::Expired)
        | (SessionStatus::Connecting, SessionStatus::Expired)
        | (SessionStatus::Active, SessionStatus::Expired) => {
            tracing::warn!(
                from = %current, to = %next,
                "session expired (24h timeout)"
            );
            Ok(next)
        }

        // §1.1 — ACTIVE → ENDED (30 min idle or network loss > 60s)
        (SessionStatus::Active, SessionStatus::Ended) => {
            tracing::info!("session ended (idle timeout or network loss)");
            Ok(next)
        }

        // Illegal transitions
        (from, to) => {
            tracing::error!(
                from = %from, to = %to,
                "ILLEGAL state transition — rejecting"
            );
            Err(DuxoError::SessionNotFound)
        }
    }
}

// ─── §6.1 — Protocol version negotiation ───

/// §6.1 — Check whether the viewer's declared protocol version is compatible
/// with this host. Returns Ok if compatible, Err with a reason if not.
pub fn check_protocol_compatibility(
    viewer_decl: &ViewerProtocolDecl,
) -> std::result::Result<(), String> {
    let viewer_ver = match ProtocolVersion::parse(&viewer_decl.protocol_version) {
        Ok(v) => v,
        Err(_) => {
            return Err(format!(
                "Invalid protocol version: {}",
                viewer_decl.protocol_version
            ))
        }
    };

    // §6.1 — MAJOR must match for wire compatibility.
    if viewer_ver.major != HOST_PROTOCOL_VERSION.major {
        return Err(format!(
            "Incompatible protocol version: host={}, viewer={}",
            HOST_PROTOCOL_VERSION, viewer_ver
        ));
    }

    // §6.1 — MINOR: host can support viewers up to host.minor + 1 forward.
    // Viewers older than host's MINOR lose some capabilities but can still connect.
    if viewer_ver.minor > HOST_PROTOCOL_VERSION.minor + 1 {
        return Err(format!(
            "Viewer too new: host={}, viewer={}",
            HOST_PROTOCOL_VERSION, viewer_ver
        ));
    }

    Ok(())
}

/// §6.1 — Determine which capabilities both sides support (intersection).
/// Never fail the whole connection for missing capabilities — negotiate down.
pub fn negotiated_capabilities(viewer_caps: &[String]) -> Vec<String> {
    let host_caps: Vec<&str> = SUPPORTED_CAPABILITIES.to_vec();
    viewer_caps
        .iter()
        .filter(|c| host_caps.contains(&c.as_str()))
        .cloned()
        .collect()
}

// ─── §7.4 — Session expiration & idle timeout ───
//
// The policy lives here with the state machine; `signaling.rs` enforces it,
// converting these to `Duration`s. There used to be a `spawn_expiry_watcher`
// here as well, running its own 60-second tick against a shared
// `SessionContext`. Nothing ever spawned it, and the session driver already
// checks both deadlines on every poll of the session node — a second timer
// racing the first to write EXPIRED would have been the only thing it added.

/// §7.4 — Max session duration in milliseconds (8 hours).
pub const MAX_SESSION_DURATION_MS: i64 = 8 * 60 * 60 * 1000;

/// §7.4 — Idle timeout in milliseconds (30 minutes).
pub const IDLE_TIMEOUT_MS: i64 = 30 * 60 * 1000;

/// §7.4 — 8-digit code lifetime in milliseconds (24 hours).
pub const CODE_LIFETIME_MS: i64 = 24 * 60 * 60 * 1000;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_happy_path_transitions() {
        let path = vec![
            (SessionStatus::Waiting, SessionStatus::Requested),
            (SessionStatus::Requested, SessionStatus::Allowed),
            (SessionStatus::Allowed, SessionStatus::Connecting),
            (SessionStatus::Connecting, SessionStatus::Active),
            (SessionStatus::Active, SessionStatus::Ended),
        ];
        let mut state = SessionStatus::Waiting;
        for (from, to) in path {
            // Assert the table's own `from` matches where the walk actually is,
            // so a reordered or wrong entry fails here rather than silently
            // testing a different transition than the one it claims to.
            assert_eq!(state, from, "path table is out of step with the walk");
            assert_eq!(transition(from, to).unwrap(), to);
            state = to;
        }
    }

    #[test]
    fn test_deny_path() {
        let state = transition(SessionStatus::Waiting, SessionStatus::Requested).unwrap();
        assert_eq!(
            transition(state, SessionStatus::Denied).unwrap(),
            SessionStatus::Denied
        );
    }

    #[test]
    fn test_expired_from_any_active_state() {
        for start in [
            SessionStatus::Waiting,
            SessionStatus::Requested,
            SessionStatus::Allowed,
            SessionStatus::Active,
        ] {
            assert!(transition(start, SessionStatus::Expired).is_ok());
        }
    }

    #[test]
    fn test_illegal_transitions() {
        // Cannot jump from WAITING directly to ACTIVE.
        assert!(transition(SessionStatus::Waiting, SessionStatus::Active).is_err());
        // Cannot go from DENIED back to ALLOWED.
        assert!(transition(SessionStatus::Denied, SessionStatus::Allowed).is_err());
        // Cannot go from ENDED to ACTIVE.
        assert!(transition(SessionStatus::Ended, SessionStatus::Active).is_err());
    }
}
