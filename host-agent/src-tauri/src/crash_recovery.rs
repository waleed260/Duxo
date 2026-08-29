use crate::types::Result;

/// §6.2 — how recent a crash marker has to be for a resume to make sense.
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
    let age_ms = now - marker.started_at;

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

/// §6.2 — Delete the crash marker on clean session end.
pub fn clear_marker() {
    if let Ok(path) = marker_path() {
        if path.exists() {
            let _ = std::fs::remove_file(&path);
            tracing::info!("crash marker cleared");
        }
    }
}
