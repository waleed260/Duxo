//! Duxo Tauri native windows — §2.4 + §3.4.
//!
//! §2.4 — Allow/Deny dialog requirements:
//!   1. Native OS window, NOT a web-controlled overlay
//!   2. Shows VERIFIED viewer email (from JWT claims, §2.5)
//!   3. NO default button focus on Allow — Tab required before Enter
//!   4. NO "always allow" checkbox in MVP
//!   5. Timeout → Denied, never Allowed
//!
//! §3.4 — Code display window:
//!   - Large monospace 8-digit code (read aloud over phone)
//!   - Grouped as XXXX XXXX for readability
//!   - Copy-to-clipboard button
//!   - "Waiting for connection..." state

use tauri::{AppHandle, Manager, WebviewWindowBuilder, WindowUrl};
use crate::tray::AppState;
use crate::security;
use crate::session;
use crate::firebase;
use crate::types::SessionStatus;

/// §3.4 — Open the code display window showing the 8-digit code.
pub fn open_code_window(app: &AppHandle, code: &str) -> Result<(), Box<dyn std::error::Error>> {
    let _window = WebviewWindowBuilder::new(
        app,
        "code-display",
        WindowUrl::App("code-display.html".into()),
    )
    .title(format!("Duxo — {code}"))
    .inner_size(420.0, 200.0)
    .resizable(false)
    .decorations(true)
    .center()
    .build()?;

    tracing::info!(code = %code, "code display window opened");
    Ok(())
}

/// §2.4 — Open the Allow/Deny popup window.
pub fn open_allow_deny_window(
    app: &AppHandle,
    viewer_email: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    // Manually encode the email to avoid adding urlencoding crate dependency.
    let encoded_email: String = viewer_email
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                b as char
            }
            _ => format!("%{:02X}", b),
        })
        .collect();

    let url = format!("allow-deny.html?email={}", encoded_email);

    let _window = WebviewWindowBuilder::new(
        app,
        "allow-deny",
        WindowUrl::App(url.into()),
    )
    .title("Duxo — Connection Request")
    .inner_size(440.0, 280.0)
    .resizable(false)
    .decorations(true)
    .center()
    .build()?;

    tracing::info!(viewer_email = %viewer_email, "allow/deny popup window opened");
    Ok(())
}

/// Close a named window if it exists.
pub fn close_window(app: &AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.close();
    }
}

/// §1.6-B — Handle the session lifecycle after Allow is clicked.
pub async fn handle_session_after_allow(
    app: AppHandle,
    session_id: String,
) -> Result<(), Box<dyn std::error::Error>> {
    use crate::webrtc_host::{HostWebRTCSession, IceConfig};
    use crate::types::SessionStatus;

    let state: tauri::State<'_, AppState> = app.state();

    // §1.1 — transition to CONNECTING.
    {
        let mut session_guard = state.session.write().await;
        if let Some(ref mut ctx) = *session_guard {
            if let Ok(new_status) = crate::session::transition(ctx.status, SessionStatus::Connecting) {
                ctx.status = new_status;
            }
        }
    }

    // §1.6-B — create the WebRTC session.
    // We read the session context, clone what we need, then drop the guard.
    let (session_id_clone, platform, protocol_version, created_at) = {
        let session_guard = state.session.read().await;
        match session_guard.as_ref() {
            Some(ctx) => (
                ctx.session_id.clone(),
                ctx.host_platform,
                ctx.protocol_version.clone(),
                ctx.created_at,
            ),
            None => return Err("No active session".into()),
        }
    };

    // §2.5 — viewer_id comes from the verified JWT claims, not host_uid.
    let verified_viewer_uid = {
        let uid_guard = state.viewer_uid.read().await;
        uid_guard.clone().unwrap_or_default()
    };

    let ctx = crate::types::SessionContext {
        session_id: session_id_clone,
        status: SessionStatus::Connecting,
        host_platform: platform,
        viewer_id: Some(verified_viewer_uid),
        verified_viewer_email: None,
        protocol_version,
        created_at,
    };

    let mut webrtc_session = HostWebRTCSession::new(ctx);

    // §0.5 — ICE config from env.
    let ice_config = IceConfig::default();

    // §1.6-B — create offer and write to RTDB.
    let offer_json = webrtc_session.create_peer_and_offer(&ice_config).await?;

    let id_token = security::get_secret("firebase_id_token")
        .map_err(|e| format!("Failed to read auth token: {e}"))?
        .ok_or("Not logged in")?;

    let config = &state.firebase_config;

    firebase::update_session_field(
        &config.database_url,
        &id_token,
        &config.project_id,
        &session_id,
        "offer",
        serde_json::json!(offer_json),
    ).await?;

    tracing::info!("SDP offer written to RTDB — waiting for viewer's answer");

    // §0.5 — start the capture → RTP pipeline in the background.
    let app_clone = app.clone();
    let sess_id = session_id.clone();
    tokio::spawn(async move {
        run_capture_pipeline(app_clone, &sess_id, webrtc_session).await;
    });

    Ok(())
}

/// §0.5 + §3 — Capture pipeline: grab frames → encode VP8 → send via RTP.
async fn run_capture_pipeline(
    app: AppHandle,
    session_id: &str,
    mut webrtc_session: crate::webrtc_host::HostWebRTCSession,
) {
    use crate::backend::CaptureBackend;

    let state: tauri::State<'_, AppState> = app.state();

    // §0.5 — select the platform-appropriate capture backend.
    #[cfg(target_os = "windows")]
    let mut capture = crate::capture_windows::WindowsCapture::new();

    #[cfg(target_os = "linux")]
    let mut capture = crate::capture_linux_x11::X11Capture::new();

    if let Err(e) = capture.start() {
        tracing::error!(error = %e, "failed to start screen capture");
        return;
    }

    // §6.2 — write crash marker so a crashed session can be detected on restart.
    let marker = crate::crash_recovery::CrashMarker {
        session_id: session_id.to_string(),
        started_at: chrono::Utc::now().timestamp_millis(),
        host_platform: std::env::consts::OS.to_string(),
    };
    if let Err(e) = crate::crash_recovery::write_marker(&marker) {
        tracing::warn!(error = %e, "failed to write crash marker");
    }

    tracing::info!("capture pipeline started — streaming video");

    // §6.5 — target: 15–20 fps @ 1280×720.
    let frame_interval = std::time::Duration::from_millis(50);
    let mut frame_count: u64 = 0;
    let mut kpi_fps_start = std::time::Instant::now();
    let mut kpi_fps_frame_count: u64 = 0;

    loop {
        let start = std::time::Instant::now();

        // Check if session is still active.
        {
            let session_guard = state.session.read().await;
            if let Some(ref ctx) = *session_guard {
                if ctx.status != SessionStatus::Active && ctx.status != SessionStatus::Connecting {
                    tracing::info!("session no longer active — stopping capture");
                    break;
                }
            } else {
                break;
            }
        }

        // §0.5 — grab a frame from the desktop.
        match capture.next_frame() {
            Ok(frame) => {
                if let Err(e) = webrtc_session.send_video_frame(&frame.data).await {
                    tracing::warn!(error = %e, frame = frame_count, "failed to send video frame");
                }
                frame_count += 1;

                if frame_count % 100 == 0 {
                    // §6.5 — KPI: frames per second and average frame interval.
                    let elapsed_s = kpi_fps_start.elapsed().as_secs_f64();
                    let fps = 100.0 / elapsed_s.max(0.001);
                    tracing::info!(
                        frame = frame_count,
                        fps = format!("{:.1}", fps),
                        avg_frame_interval_ms = format!("{:.1}", elapsed_s * 10.0),
                        "capture pipeline running"
                    );
                    kpi_fps_start = std::time::Instant::now();
                }
            }
            Err(e) => {
                tracing::warn!(error = %e, "frame capture failed — retrying");
            }
        }

        // §6.5 — maintain target frame rate.
        let elapsed = start.elapsed();
        if elapsed < frame_interval {
            tokio::time::sleep(frame_interval - elapsed).await;
        }
    }

    // §6.2 — clear crash marker on clean pipeline stop (not a crash).
    crate::crash_recovery::clear_marker();

    let _ = capture.stop();
    webrtc_session.close().await;

    tracing::info!(total_frames = frame_count, "capture pipeline stopped");
}
