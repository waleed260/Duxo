//! Duxo host agent — Tauri v2 + Rust remote desktop host.
//!
//! §0.4 architecture: portable host agent (Windows .exe / Linux .AppImage).
//! §1.2 — owns screen capture, WebRTC peer, input injection, ALL permission
//! decisions. Never auto-accepts; never injects input before ACTIVE confirmed.
//!
//! "No installer" philosophy (§0.4): single binary, no admin for basic use.

mod audit;
mod backend;
#[cfg(target_os = "linux")]
mod capture_linux_x11;
#[cfg(target_os = "windows")]
mod capture_windows;
mod firebase;
#[cfg(target_os = "linux")]
mod input_linux_x11;
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

#[derive(serde::Deserialize)]
struct GitHubRelease {
    tag_name: String,
    html_url: String,
    body: Option<String>,
}
