//! Duxo host agent — Tauri v2 + Rust remote desktop host.
//!
//! §0.4 architecture: portable host agent (Windows .exe / Linux .AppImage).
//! §1.2 — owns screen capture, WebRTC peer, input injection, ALL permission
//! decisions. Never auto-accepts; never injects input before ACTIVE confirmed.
//!
//! "No installer" philosophy (§0.4): single binary, no admin for basic use.

mod audit;
mod backend;
mod crash_recovery;
#[cfg(target_os = "linux")]
mod capture_linux_x11;
#[cfg(target_os = "windows")]
mod capture_windows;
mod firebase;
#[cfg(target_os = "linux")]
mod input_linux_x11;
#[cfg(target_os = "windows")]
mod input_windows;
mod security;
mod session;
mod tray;
mod types;
mod webrtc_host;
mod windows;

use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    // §1.6 — logging: local rotating file, no cloud logging bill.
    // Logs event types and timestamps only — never input content (keystrokes,
    // clipboard text) to avoid creating a keylogger artifact on disk.
    let log_dir = dirs::data_local_dir()
        .expect("cannot determine local data directory")
        .join("duxo")
        .join("logs");
    std::fs::create_dir_all(&log_dir).expect("cannot create log directory");

    let file_appender = tracing_appender::rolling::daily(&log_dir, "duxo.log");
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_writer(non_blocking)
        .with_ansi(false)
        .json()
        .init();

    tracing::info!(version = env!("CARGO_PKG_VERSION"), "duxo-host starting");

    // §1.5 — check for updates on launch (free GitHub Releases API).
    match check_for_update().await {
        Ok(Some(latest)) => {
            tracing::info!(latest_version = %latest.tag, "update available");
            // MVP: log + surface via tray. No auto-install until Tauri updater
            // is configured (§1.5 Phase 2).
        }
        Ok(None) => tracing::info!("host agent is up to date"),
        Err(e) => tracing::warn!(error = %e, "update check failed (non-fatal)"),
    }

    // §6.4 — check minimum supported version.
    match check_minimum_version().await {
        Ok(Some(msg)) => {
            tracing::error!(message = %msg, "host agent below minimum supported version");
            // In production, this would show a blocking dialog to the user.
            // For MVP, we log it — the session state machine will reject
            // connections from incompatible versions via §6.1 negotiation.
        }
        Ok(None) => tracing::info!("host agent meets minimum version requirement"),
        Err(e) => tracing::warn!(error = %e, "minversion check failed (non-fatal)"),
    }

    // §6.2 — Check for crash marker from a previous session.
    match crash_recovery::read_marker() {
        Ok(Some(marker)) => {
            tracing::warn!(
                session_id = %marker.session_id,
                platform = %marker.host_platform,
                "previous session crashed — resume available"
            );
            // In a full implementation, the tray would show a "Resume previous session?"
            // prompt. For MVP, we log it and clear the marker so it doesn't pile up.
            // The user can manually start a new session.
            crash_recovery::clear_marker();
        }
        Ok(None) => {
            tracing::info!("no crash marker found — clean startup");
        }
        Err(e) => {
            tracing::warn!(error = %e, "failed to check crash marker (non-fatal)");
        }
    }

    // Launch the Tauri app with tray icon + code display.
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Initialize tray icon, code display window, and RTDB listeners.
            tray::setup_tray(app.handle())
                .map_err(|e| e.to_string())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            tray::generate_code,
            tray::get_session_status,
            tray::get_display_code,
            tray::get_viewer_email,
            tray::handle_allow,
            tray::handle_deny,
            tray::end_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running duxo-host");
}

/// §1.5 — Manual check + notify (recommended for MVP).
/// Calls the public, unauthenticated GitHub Releases API.
/// 60 requests/hour/IP unauthenticated — plenty for a periodic check.
async fn check_for_update() -> Result<Option<GitHubRelease>, Box<dyn std::error::Error>> {
    let client = reqwest::Client::builder()
        .user_agent(format!("duxo-host/{}", env!("CARGO_PKG_VERSION")))
        .build()?;

    let resp = client
        .get("https://api.github.com/repos/duxo-org/duxo/releases/latest")
        .send()
        .await?;

    if !resp.status().is_success() {
        return Ok(None);
    }

    let release: GitHubRelease = resp.json().await?;

    let current = semver::Version::parse(env!("CARGO_PKG_VERSION"))?;
    let latest_tag = release.tag_name.trim_start_matches('v');
    let latest = semver::Version::parse(latest_tag)?;

    if latest > current {
        Ok(Some(release))
    } else {
        Ok(None)
    }
}

/// §6.4 — Minimum supported version file, served from GitHub Pages.
#[derive(serde::Deserialize)]
struct MinVersionFile {
    minimum_version: String,
    minimum_protocol_version: String,
    message: String,
    updated_at: String,
}

/// §6.4 — Check whether the running version meets the minimum supported version.
/// Fetches minversion.json from the viewer's GitHub Pages deployment.
async fn check_minimum_version() -> Result<Option<String>, Box<dyn std::error::Error>> {
    let client = reqwest::Client::builder()
        .user_agent(format!("duxo-host/{}", env!("CARGO_PKG_VERSION")))
        .build()?;

    let resp = client
        .get("https://waleed260.github.io/Duxo/minversion.json")
        .send()
        .await?;

    if !resp.status().is_success() {
        return Ok(None);
    }

    let min_ver: MinVersionFile = resp.json().await?;

    let current = semver::Version::parse(env!("CARGO_PKG_VERSION"))?;
    let minimum = semver::Version::parse(&min_ver.minimum_version)?;

    if current < minimum {
        Ok(Some(min_ver.message))
    } else {
        Ok(None)
    }
}

#[derive(serde::Deserialize)]
struct GitHubRelease {
    tag_name: String,
    html_url: String,
    body: Option<String>,
}
