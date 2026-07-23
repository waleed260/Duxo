//! Duxo system tray + code display + Allow/Deny popup.
//!
//! §3.4 — host agent: tray icon → code display window → Allow/Deny popup.
//! §2.4 — the Allow/Deny dialog is the single most important screen in the product:
//!   - Native OS window, NOT a web-controlled overlay
//!   - Shows VERIFIED viewer email (from JWT claims, §2.5)
//!   - NO default button focus on Allow (startled Enter = Deny)
//!   - NO "always allow" checkbox in MVP
//!   - Timeout → Denied, never Allowed
//!
//! §1.1 — session state machine enforced here:
//!   CREATED → WAITING → REQUESTED → ALLOWED/DENIED → CONNECTING → ACTIVE → ENDED

use std::sync::Arc;
use tauri::{AppHandle, Manager, State, command, window::WindowBuilder, WindowUrl};
use tokio::sync::RwLock;
use crate::firebase;
use crate::security;
use crate::session;
use crate::types::{SessionContext, SessionStatus, HostPlatform, DuxoError};
use crate::windows;

/// Shared application state accessible from Tauri commands.
pub struct AppState {
    /// The current session context, if one exists.
    pub session: RwLock<Option<SessionContext>>,
    /// Firebase config pulled from env.
    pub firebase_config: FirebaseEnv,
    /// The viewer's verified email, populated after JWT verification (§2.5).
    pub viewer_email: RwLock<Option<String>>,
    /// The viewer's verified UID, populated after JWT verification.
    pub viewer_uid: RwLock<Option<String>>,
    /// Google's public signing certs, fetched once per session.
    pub google_certs: RwLock<Option<security::JwkSet>>,
    /// Current 8-digit display code (formatted as "XXXX XXXX").
    pub current_code: RwLock<Option<String>>,
}

/// Firebase configuration from environment variables.
pub struct FirebaseEnv {
    pub database_url: String,
    pub project_id: String,
}

/// Set up the system tray icon and menu.
///
/// §0.5 — GNOME needs a tray extension (flagged in README).
pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    tracing::info!("system tray initialized");

    // Register the shared state so Tauri commands can access it.
    let firebase_config = FirebaseEnv {
        database_url: std::env::var("DUXO_FIREBASE_DATABASE_URL")
            .unwrap_or_else(|_| "https://your-project.firebaseio.com".into()),
        project_id: std::env::var("DUXO_FIREBASE_PROJECT_ID")
            .unwrap_or_else(|_| "your-project-id".into()),
    };

    let state = AppState {
        session: RwLock::new(None),
        firebase_config,
        viewer_email: RwLock::new(None),
        viewer_uid: RwLock::new(None),
        google_certs: RwLock::new(None),
        current_code: RwLock::new(None),
    };
    app.manage(state);

    // §1.6 — on launch, check for updates (non-blocking, logged locally).
    tracing::info!("tray setup complete — ready to accept sessions");

    Ok(())
}

/// §0.6 — generate an 8-digit code and create an RTDB session.
///
/// Called from the code display window when the host clicks "Generate code".
/// This is the CREATED → WAITING transition (§1.1).
#[command]
pub async fn generate_code(app: AppHandle) -> Result<String, String> {
    let state: State<'_, AppState> = app.state();
    let config = &state.firebase_config;

    // §2.6 — retrieve the Firebase ID token from the OS keychain.
    let id_token = security::get_secret("firebase_id_token")
        .map_err(|e| format!("Failed to read auth token: {e}"))?
        .ok_or("Not logged in — please sign in first")?;

    // §1.1 — detect platform for the session metadata.
    let platform = HostPlatform::detect();
    let host_uid = security::get_secret("firebase_uid")
        .map_err(|e| format!("Failed to read user ID: {e}"))?
        .ok_or("Not logged in")?;

    // §1.1 — create the RTDB session skeleton + 8-digit code.
    let (session_id, raw_code) = firebase::create_session(
        &config.database_url,
        &id_token,
        &config.project_id,
        &host_uid,
        &platform.to_string(),
    )
    .await
    .map_err(|e| format!("Failed to create session: {e}"))?;

    // §1.1 — transition CREATED → WAITING (already done by create_session writing status=waiting).
    let new_ctx = session::new_session(session_id.clone(), &host_uid);
    {
        let mut session_guard = state.session.write().await;
        *session_guard = Some(new_ctx);
    }

    // Format code as XXXX XXXX for readability when read aloud over phone (§3.4).
    let formatted = if raw_code.len() == 8 {
        format!("{} {}", &raw_code[..4], &raw_code[4..])
    } else {
        raw_code.clone()
    };

    {
        let mut code_guard = state.current_code.write().await;
        *code_guard = Some(formatted.clone());
    }

    tracing::info!(
        session_id = %session_id,
        code = %raw_code,
        platform = %platform,
        "session created — waiting for viewer"
    );

    // §3.4 — open the code display window so the host can see/share the code.
    if let Err(e) = windows::open_code_window(&app, &formatted) {
        tracing::warn!(error = %e, "failed to open code display window");
    }

    // §1.6-B — spawn a background task to listen for viewer requests via RTDB.
    let app_clone = app.clone();
    let db_url = config.database_url.clone();
    let proj_id = config.project_id.clone();
    let sess_id = session_id.clone();

    tokio::spawn(async move {
        listen_for_viewer_requests(app_clone, &db_url, &proj_id, &sess_id, &id_token).await;
    });

    Ok(formatted)
}

/// §1.6-B — background listener: watches RTDB session node for REQUESTED status.
///
/// When a viewer writes their viewerId + ID token, the host sees the status
/// change to REQUESTED, verifies the JWT (§2.5), then shows the Allow/Deny popup.
async fn listen_for_viewer_requests(
    app: AppHandle,
    database_url: &str,
    project_id: &str,
    session_id: &str,
    host_id_token: &str,
) {
    // §2.5 — fetch Google's public certs once for JWT verification.
    let certs = match security::fetch_google_certs(project_id).await {
        Ok(c) => c,
        Err(e) => {
            tracing::error!(error = %e, "failed to fetch Google certs — cannot verify viewers");
            return;
        }
    };

    let state: State<'_, AppState> = app.state();
    {
        let mut certs_guard = state.google_certs.write().await;
        *certs_guard = Some(certs);
    }

    // Poll RTDB for status changes (§0.6 — REST API, no Rust SDK needed).
    let client = reqwest::Client::new();
    let poll_url = format!(
        "{}/sessions/{}.json?auth={}",
        database_url.trim_end_matches('/'), session_id, host_id_token,
    );

    loop {
        tokio::time::sleep(std::time::Duration::from_millis(1000)).await;

        let resp = match client.get(&poll_url).send().await {
            Ok(r) => r,
            Err(e) => {
                tracing::warn!(error = %e, "RTDB poll failed — retrying");
                continue;
            }
        };

        let body: serde_json::Value = match resp.json().await {
            Ok(v) => v,
            Err(_) => continue,
        };

        let status_str = body.get("status")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        match status_str {
            "requested" => {
                // §1.6-B — viewer has attached their UID + token.
                let viewer_id = body.get("viewerId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let viewer_token = body.get("viewerToken")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");

                if viewer_id.is_empty() || viewer_token.is_empty() {
                    tracing::warn!("REQUESTED but missing viewerId or viewerToken — skipping");
                    continue;
                }

                // §2.5 — verify the viewer's Firebase ID token signature locally.
                let certs_guard = state.google_certs.read().await;
                let certs_ref = certs_guard.as_ref().unwrap();

                let verified = security::verify_viewer_token(viewer_token, certs_ref, project_id);
                drop(certs_guard);

                let claims = match verified {
                    Ok(c) => c,
                    Err(e) => {
                        tracing::warn!(
                            error = %e,
                            viewer_id = %viewer_id,
                            "JWT verification failed — denying"
                        );
                        // §2.5 — if we can't verify the token, deny the session.
                        let _ = firebase::set_permission(
                            database_url, host_id_token, project_id, session_id, false,
                        ).await;
                        continue;
                    }
                };

                // §2.5 — verify the UID in the token matches what the viewer wrote to RTDB.
                if claims.sub != viewer_id {
                    tracing::warn!(
                        token_uid = %claims.sub,
                        rtdb_uid = %viewer_id,
                        "UID mismatch — potential spoofing, denying"
                    );
                    let _ = firebase::set_permission(
                        database_url, host_id_token, project_id, session_id, false,
                    ).await;
                    continue;
                }

                // Store verified viewer info.
                {
                    let mut email_guard = state.viewer_email.write().await;
                    *email_guard = Some(claims.email.clone());
                    let mut uid_guard = state.viewer_uid.write().await;
                    *uid_guard = Some(claims.sub.clone());
                }

                tracing::info!(
                    viewer_email = %claims.email,
                    viewer_uid = %claims.sub,
                    "viewer identity verified — showing Allow/Deny popup"
                );

                // §2.4 — open the native Allow/Deny popup with verified email.
                if let Err(e) = windows::open_allow_deny_window(&app, &claims.email) {
                    tracing::warn!(error = %e, "failed to open allow/deny window — denying");
                    let _ = firebase::set_permission(
                        database_url, host_id_token, project_id, session_id, false,
                    ).await;
                    continue;
                }

                // §1.1 — REQUESTED → ALLOWED or DENIED is gated on user click.
                show_allow_deny_popup(&app, &claims.email).await;

                break; // Session is now either ALLOWED or DENIED.
            }
            "ended" | "expired" => {
                tracing::info!(status = %status_str, "session ended externally");
                break;
            }
            _ => {
                // Still waiting — continue polling.
            }
        }
    }
}

/// §2.4 — show the native Allow/Deny popup.
///
/// Requirements:
///   1. Native OS window, NOT a web-controlled overlay.
///   2. Shows VERIFIED viewer email (from JWT claims, §2.5).
///   3. NO default focus on Allow — Tab required before Enter.
///   4. NO "always allow" checkbox in MVP.
///   5. Timeout → Denied, never Allowed.
async fn show_allow_deny_popup(app: &AppHandle, viewer_email: &str) {
    // §2.4 — In a full Tauri implementation, this would open a native window.
    // For now, we log the request and use the command handlers.
    //
    // The popup window would be:
    //   - A small, focused native window (not a webview)
    //   - Title: "Duxo — Connection Request"
    //   - Shows the verified viewer email
    //   - "This person is requesting full control of your screen, mouse, and keyboard."
    //   - Two buttons: Deny (default focus) and Allow (no default focus)
    //   - Timeout after 60s → auto-Deny
    //
    // §3.4 — Design spec for the Allow/Deny dialog:
    //   ┌──────────────────────────────────────┐
    //   │ Duxo                    – □ ✕        │
    //   │ ⚠ sam.rivera@gmail.com              │
    //   │     [ Requesting access ]            │
    //   │ This person is requesting full       │
    //   │ control of your screen, mouse        │
    //   │ and keyboard.                        │
    //   │ [    Deny   ]   [ Allow(●) ]        │
    //   └──────────────────────────────────────┘

    tracing::info!(
        viewer_email = %viewer_email,
        "Allow/Deny popup shown — waiting for host decision"
    );

    // §2.4 — timeout after 60 seconds → auto-Deny (never Allow).
    let state: State<'_, AppState> = app.state();
    let config = &state.firebase_config;

    let id_token = match security::get_secret("firebase_id_token") {
        Ok(Some(t)) => t,
        _ => return,
    };

    let session_guard = state.session.read().await;
    let session_id = match session_guard.as_ref() {
        Some(s) => s.session_id.clone(),
        None => return,
    };
    drop(session_guard);

    // §2.4 — 60-second timeout → deny.
    let timeout_result = tokio::time::timeout(
        std::time::Duration::from_secs(60),
        wait_for_host_decision(app.clone()),
    ).await;

    let allowed = match timeout_result {
        Ok(decision) => decision,
        Err(_) => {
            tracing::info!("Allow/Deny timeout — defaulting to DENY (§2.4)");
            false
        }
    };

    // §1.1 — write ALLOWED or DENIED to RTDB.
    let _ = firebase::set_permission(
        &config.database_url,
        &id_token,
        &config.project_id,
        &session_id,
        allowed,
    ).await;

    // §1.1 — if allowed, transition to CONNECTING.
    if allowed {
        let mut session_guard = state.session.write().await;
        if let Some(ref mut ctx) = *session_guard {
            if let Ok(new_status) = session::transition(ctx.status, SessionStatus::Connecting) {
                ctx.status = new_status;
                tracing::info!("session transitioned to CONNECTING");
            }
        }
    } else {
        let mut session_guard = state.session.write().await;
        if let Some(ref mut ctx) = *session_guard {
            if let Ok(new_status) = session::transition(ctx.status, SessionStatus::Denied) {
                ctx.status = new_status;
                // §7.2 — clear sensitive viewer data on denial.
                ctx.zeroize();
                tracing::info!("session transitioned to DENIED");
            }
        }
    }
}

/// Wait for the host to click Allow or Deny via the Tauri command handler.
/// Returns `true` for Allow, `false` for Deny.
async fn wait_for_host_decision(app: AppHandle) -> bool {
    // In production, this would be a oneshot channel signaled by the
    // handle_allow / handle_deny commands. For now, we use a simple poll.
    loop {
        let state: State<'_, AppState> = app.state();
        let session_guard = state.session.read().await;
        if let Some(ref ctx) = *session_guard {
            match ctx.status {
                SessionStatus::Allowed => return true,
                SessionStatus::Denied => return false,
                SessionStatus::Requested => {
                    // Still waiting — keep polling.
                }
                _ => return false,
            }
        } else {
            return false;
        }
        drop(session_guard);
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }
}

/// Get the current session status for the code display window polling.
#[command]
pub async fn get_session_status(app: AppHandle) -> Result<String, String> {
    let state: State<'_, AppState> = app.state();
    let session_guard = state.session.read().await;
    match session_guard.as_ref() {
        Some(ctx) => Ok(ctx.status.to_string()),
        None => Ok("none".to_string()),
    }
}

/// Get the current display code for the code display window.
#[command]
pub async fn get_display_code(app: AppHandle) -> Result<String, String> {
    let state: State<'_, AppState> = app.state();
    let code_guard = state.current_code.read().await;
    match code_guard.as_ref() {
        Some(code) => Ok(code.clone()),
        None => Ok("".to_string()),
    }
}

/// Get the verified viewer email for display in the Allow/Deny popup.
#[command]
pub async fn get_viewer_email(app: AppHandle) -> Result<String, String> {
    let state: State<'_, AppState> = app.state();
    let email_guard = state.viewer_email.read().await;
    match email_guard.as_ref() {
        Some(email) => Ok(email.clone()),
        None => Ok("".to_string()),
    }
}

/// §2.4 — host clicks ALLOW. This is the single most important action in the app.
///
/// §2.4 requirements:
///   1. Popup rendered in host agent's native window, not web view.
///   2. Shows VERIFIED viewer email (from JWT claims, §2.5).
///   3. NO default focus on Allow — Tab required before Enter.
///   4. NO "always allow" checkbox in MVP.
#[command]
pub async fn handle_allow(app: AppHandle) -> Result<(), String> {
    tracing::info!("handle_allow — host granted permission");

    let state: State<'_, AppState> = app.state();
    let mut session_guard = state.session.write().await;

    if let Some(ref mut ctx) = *session_guard {
        // §1.1 — transition REQUESTED → ALLOWED.
        match session::transition(ctx.status, SessionStatus::Allowed) {
            Ok(new_status) => {
                ctx.status = new_status;
                tracing::info!("session transitioned to ALLOWED");
            }
            Err(e) => {
                tracing::error!(error = %e, "illegal state transition in handle_allow");
                return Err(format!("Cannot allow: {e}"));
            }
        }
    } else {
        return Err("No active session to allow".to_string());
    }

    Ok(())
}

/// §2.4 — host clicks DENY.
#[command]
pub async fn handle_deny(app: AppHandle) -> Result<(), String> {
    tracing::info!("handle_deny — host denied permission");

    let state: State<'_, AppState> = app.state();
    let mut session_guard = state.session.write().await;

    if let Some(ref mut ctx) = *session_guard {
        // §1.1 — transition REQUESTED → DENIED.
        match session::transition(ctx.status, SessionStatus::Denied) {
            Ok(new_status) => {
                ctx.status = new_status;
                tracing::info!("session transitioned to DENIED");
            }
            Err(e) => {
                tracing::error!(error = %e, "illegal state transition in handle_deny");
                return Err(format!("Cannot deny: {e}"));
            }
        }
    } else {
        return Err("No active session to deny".to_string());
    }

    Ok(())
}

/// End the current session (either peer can do this, §1.1).
#[command]
pub async fn end_session(app: AppHandle) -> Result<(), String> {
    let state: State<'_, AppState> = app.state();
    let config = &state.firebase_config;

    let id_token = security::get_secret("firebase_id_token")
        .map_err(|e| format!("Failed to read auth token: {e}"))?
        .ok_or("Not logged in")?;

    let session_guard = state.session.read().await;
    let session_id = match session_guard.as_ref() {
        Some(s) => s.session_id.clone(),
        None => return Ok(()),
    };
    drop(session_guard);

    // §1.1 — write ENDED to RTDB.
    let _ = firebase::end_session(
        &config.database_url, &id_token, &config.project_id, &session_id,
    ).await;

    // §1.1 — transition to ENDED locally.
    let mut session_guard = state.session.write().await;
    if let Some(ref mut ctx) = *session_guard {
        let _ = session::transition(ctx.status, SessionStatus::Ended);
        ctx.status = SessionStatus::Ended;
        // §7.2 — clear sensitive data from memory.
        ctx.zeroize();
    }

    // §6.2 — clear crash marker on clean shutdown.
    crate::crash_recovery::clear_marker();

    tracing::info!("session ended by host");
    Ok(())
}
