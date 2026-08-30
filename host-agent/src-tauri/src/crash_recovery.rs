use crate::types::Result;

/// §6.2 — how long after the host was last alive a resume still makes sense.
///
/// Measured against `last_seen_at`, not `started_at`. Measuring from the start
/// of the session made the window mean "sessions shorter than five minutes":
/// a host that crashed ten minutes into a call left a marker judged stale and
/// deleted on sight, and the next launch logged a clean startup. The feature
/// only ever worked for crashes in the first five minutes.
const RESUME_WINDOW_MS: i64 = 5 * 60 * 1000;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// §6.2 — Crash marker written when a session starts, deleted on clean shutdown.
/// If this file exists on startup, the previous session likely crashed.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrashMarker {
    pub session_id: String,
    pub started_at: i64,
    pub host_platform: String,
    /// When the host last confirmed it was alive, refreshed by the session
    /// loop. This is what makes the age of a marker mean "how long ago did
    /// this host stop", which is the question §6.2 actually asks.
    ///
    /// Defaulted for markers written by an older build, which have no such
    /// field; those fall back to `started_at` via `last_seen()`.
    #[serde(default)]
    pub last_seen_at: Option<i64>,
}

impl CrashMarker {
    /// The most recent moment this host is known to have been running.
    pub fn last_seen(&self) -> i64 {
        self.last_seen_at.unwrap_or(self.started_at)
    }
}

/// Directory for crash marker: ~/.local/share/duxo/ (Linux) / %APPDATA%/duxo/ (Windows)
fn marker_dir() -> Result<PathBuf> {
    let base = dirs::data_local_dir().ok_or_else(|| {
        crate::types::DuxoError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "cannot determine local data directory",
        ))
    })?;
    Ok(base.join("duxo"))
}

fn marker_path() -> Result<PathBuf> {
    Ok(marker_dir()?.join("crash_marker.json"))
}

/// §6.2 — Write a crash marker when a session starts.
/// Deleted on clean shutdown (§6.2: "flushed to a small local file only on crash").
/// If the process exits without deleting it, the marker persists and is read on next launch.
pub fn write_marker(marker: &CrashMarker) -> Result<()> {
    let dir = marker_dir()?;
    std::fs::create_dir_all(&dir).map_err(crate::types::DuxoError::Io)?;

    let path = marker_path()?;
    let json = serde_json::to_string_pretty(marker).map_err(crate::types::DuxoError::Json)?;
    std::fs::write(&path, &json).map_err(crate::types::DuxoError::Io)?;

    tracing::info!(
        session_id = %marker.session_id,
        path = %path.display(),
        "crash marker written"
    );
    Ok(())
}

/// §6.2 — Read the crash marker if it exists and is recent (< 5 minutes old).
pub fn read_marker() -> Result<Option<CrashMarker>> {
    let path = match marker_path() {
        Ok(p) => p,
        Err(_) => return Ok(None),
    };

    if !path.exists() {
        return Ok(None);
    }

    let contents = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => {
            let _ = std::fs::remove_file(&path);
            return Ok(None);
        }
    };

    let marker: CrashMarker = match serde_json::from_str(&contents) {
        Ok(m) => m,
        Err(_) => {
            let _ = std::fs::remove_file(&path);
            return Ok(None);
        }
    };

    let now = chrono::Utc::now().timestamp_millis();
    let age_ms = now - marker.last_seen();

    // §6.2 — only offer resume if the marker is under 5 minutes old. A
    // negative age means the clock moved backwards since the marker was
    // written, which makes the age meaningless rather than small.
    if !(0..=RESUME_WINDOW_MS).contains(&age_ms) {
        tracing::info!(
            age_ms = age_ms,
            "crash marker stale (>5 min or negative) — removing"
        );
        let _ = std::fs::remove_file(&path);
        return Ok(None);
    }

    tracing::info!(
        session_id = %marker.session_id,
        age_ms = age_ms,
        "crash marker found — previous session may have crashed"
    );
    Ok(Some(marker))
}

/// §6.2 — Refresh `last_seen_at` so the marker's age tracks how long ago the
/// host stopped, rather than how long the session had been running.
///
/// Called on a slow cadence from the session loop: the point is to bound how
/// far in the past a crash can look, not to record a precise moment, and a
/// small file rewritten every second for eight hours is a lot of disk writes
/// to answer a question with five-minute granularity.
pub fn touch_marker() {
    let Ok(path) = marker_path() else { return };
    let Ok(contents) = std::fs::read_to_string(&path) else {
        return;
    };
    let Ok(mut marker) = serde_json::from_str::<CrashMarker>(&contents) else {
        return;
    };
    marker.last_seen_at = Some(chrono::Utc::now().timestamp_millis());
    if let Ok(json) = serde_json::to_string_pretty(&marker) {
        let _ = std::fs::write(&path, json);
    }
}

/// §6.2 — Delete the crash marker on clean session end.
pub fn clear_marker() {
    if let Ok(path) = marker_path() {
        if path.exists() {
            let _ = std::fs::remove_file(&path);
            tracing::info!("crash marker cleared");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn marker(started_at: i64, last_seen_at: Option<i64>) -> CrashMarker {
        CrashMarker {
            session_id: "s".into(),
            started_at,
            host_platform: "linux-x11".into(),
            last_seen_at,
        }
    }

    #[test]
    fn last_seen_prefers_the_heartbeat() {
        assert_eq!(marker(1_000, Some(9_000)).last_seen(), 9_000);
    }

    #[test]
    fn last_seen_falls_back_for_markers_from_an_older_build() {
        // A marker written before `last_seen_at` existed deserialises with
        // None, and must still be readable rather than treated as corrupt.
        assert_eq!(marker(1_000, None).last_seen(), 1_000);
    }

    #[test]
    fn a_long_session_that_just_crashed_is_still_resumable() {
        // The bug this replaces: age was measured from `started_at`, so a
        // host that crashed moments ago after an eight-hour session looked
        // eight hours stale and the marker was deleted on sight.
        let now = chrono::Utc::now().timestamp_millis();
        let eight_hours_ago = now - 8 * 60 * 60 * 1000;
        let m = marker(eight_hours_ago, Some(now - 10_000));
        assert!((0..=RESUME_WINDOW_MS).contains(&(now - m.last_seen())));
    }

    #[test]
    fn a_genuinely_old_marker_is_still_rejected() {
        let now = chrono::Utc::now().timestamp_millis();
        let m = marker(now - 60 * 60 * 1000, Some(now - 30 * 60 * 1000));
        assert!(!(0..=RESUME_WINDOW_MS).contains(&(now - m.last_seen())));
    }

    #[test]
    fn a_marker_from_the_future_is_rejected() {
        // A clock that moved backwards makes the age meaningless, not small.
        let now = chrono::Utc::now().timestamp_millis();
        let m = marker(now, Some(now + 10 * 60 * 1000));
        assert!(!(0..=RESUME_WINDOW_MS).contains(&(now - m.last_seen())));
    }

    #[test]
    fn deserialises_a_marker_written_without_the_heartbeat_field() {
        let json = r#"{"session_id":"s","started_at":1000,"host_platform":"windows"}"#;
        let m: CrashMarker = serde_json::from_str(json).expect("older marker must still parse");
        assert_eq!(m.last_seen_at, None);
        assert_eq!(m.last_seen(), 1000);
    }
}
