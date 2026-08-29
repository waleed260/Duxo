//! Duxo system tray, device pairing, and the Allow/Deny bridge — §2.4, §3.4.
//!
//! This module used to claim to set up a tray and did not: `setup_tray` logged
//! a line, registered some shared state, and returned. There was no icon, no
//! menu, and therefore no way for a user to start a session at all. It also
//! read a Firebase token out of the keychain that nothing in the codebase ever
//! wrote, so even reaching `generate_code` would have failed on "Not logged in".
//!
//! What lives here now is only the UI edge: a real tray icon, the Tauri
//! commands the two HTML windows call, and the plumbing that connects the
//! Allow/Deny click to the session driver. The state machine itself is in
//! `signaling.rs`, deliberately free of Tauri types.
//!
//! §2.4 — the Allow/Deny dialog rules are enforced across three places, and
//! all three matter: the HTML gives Allow no autofocus, this module forwards
//! nothing but an explicit click, and `signaling.rs` treats a timeout or a
//! closed channel as Deny.

use std::sync::Arc;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{command, AppHandle, Manager, State};
use tokio::sync::{mpsc, Mutex, RwLock};

use crate::auth::HostAuth;
use crate::signaling::{SessionDriver, SessionEvent};
use crate::types::{HostPlatform, SessionStatus};
use crate::webrtc_host::IceConfig;
use crate::windows;

/// Firebase configuration, read from the environment at startup.
pub struct FirebaseEnv {
    /// Web API key — needed for the public token endpoints (§8.3). This is not
    /// a secret: it is the same key shipped in every Firebase web app.
    pub api_key: String,
    pub database_url: String,
    pub project_id: String,
    /// Where the user goes to approve a device pairing.
    pub web_app_url: String,
}

impl FirebaseEnv {
    fn from_env() -> Self {
        Self {
            api_key: std::env::var("DUXO_FIREBASE_API_KEY").unwrap_or_default(),
            database_url: std::env::var("DUXO_FIREBASE_DATABASE_URL").unwrap_or_default(),
            project_id: std::env::var("DUXO_FIREBASE_PROJECT_ID").unwrap_or_default(),
            web_app_url: std::env::var("DUXO_WEB_APP_URL")
                .unwrap_or_else(|_| "https://duxo.dev".to_string()),
        }
    }

    fn is_configured(&self) -> bool {
        !self.api_key.is_empty()
            && !self.database_url.is_empty()
            && !self.project_id.is_empty()
    }
}

/// Shared application state, reachable from every Tauri command.
pub struct AppState {
    pub firebase_config: FirebaseEnv,
    /// The paired Firebase session, once this device has been linked.
    pub auth: RwLock<Option<Arc<Mutex<HostAuth>>>>,
    /// §2.4 — the channel the Allow/Deny window's click travels down. Present
    /// only while a decision is actually pending, so a stray `handle_allow`
    /// from a leftover window cannot authorise anything.
    pub decision: Mutex<Option<mpsc::Sender<bool>>>,
    /// §3.4 — the code being displayed, formatted "XXXX XXXX".
    pub display_code: RwLock<Option<String>>,
    /// §2.5 — the verified viewer email, from JWT claims only.
    pub viewer_email: RwLock<Option<String>>,
    pub status: RwLock<SessionStatus>,
    /// The running session task, so "End session" can stop it.
    pub session_task: Mutex<Option<tokio::task::JoinHandle<()>>>,
}

impl AppState {
    fn new() -> Self {
        Self {
            firebase_config: FirebaseEnv::from_env(),
            auth: RwLock::new(None),
            decision: Mutex::new(None),
            display_code: RwLock::new(None),
            viewer_email: RwLock::new(None),
            status: RwLock::new(SessionStatus::Ended),
            session_task: Mutex::new(None),
        }
    }
}

/// Build the tray icon and its menu, and restore any existing pairing.
///
/// §0.5 — on GNOME this needs the AppIndicator extension; that is flagged in
/// the README because without it the icon simply does not appear and the app
/// looks like it failed to launch.
pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let state = AppState::new();
    let configured = state.firebase_config.is_configured();
    app.manage(state);

    let start = MenuItem::with_id(app, "start", "Start a session", true, None::<&str>)?;
    let end = MenuItem::with_id(app, "end", "End session", true, None::<&str>)?;
    let link = MenuItem::with_id(app, "link", "Link this device…", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Duxo", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&start, &end, &link, &separator, &quit])?;

    let mut builder = TrayIconBuilder::with_id("duxo-tray")
        .menu(&menu)
        .tooltip("Duxo — Remote Desktop Host")
        .on_menu_event(move |app, event| {
            let app = app.clone();
            match event.id.as_ref() {
                "start" => {
                    tauri::async_runtime::spawn(async move { start_session(app).await });
                }
                "end" => {
                    tauri::async_runtime::spawn(async move {
                        let _ = end_session(app).await;
                    });
                }
                "link" => {
                    tauri::async_runtime::spawn(async move { link_device(app).await });
                }
                "quit" => app.exit(0),
                _ => {}
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app)?;

    if !configured {
        tracing::error!(
            "Firebase is not configured — set DUXO_FIREBASE_API_KEY, \
             DUXO_FIREBASE_DATABASE_URL and DUXO_FIREBASE_PROJECT_ID"
        );
        return Ok(());
    }

    // §2.6 — restore a previous pairing from the OS keychain, if there is one.
    let app_for_restore = app.clone();
    tauri::async_runtime::spawn(async move {
        restore_pairing(app_for_restore).await;
    });

    tracing::info!("system tray initialised");
    Ok(())
}

/// §8.2 — bring back the device's existing pairing on launch.
async fn restore_pairing(app: AppHandle) {
    let state: State<'_, AppState> = app.state();
    let cfg = &state.firebase_config;

    match HostAuth::restore(&cfg.api_key, &cfg.database_url, &cfg.project_id).await {
        Ok(Some(auth)) => {
            tracing::info!(uid = %auth.uid(), "device already linked");
            *state.auth.write().await = Some(Arc::new(Mutex::new(auth)));
        }
        Ok(None) => {
            tracing::info!("device is not linked yet — use \"Link this device\"");
        }
        Err(e) => {
            tracing::warn!(error = %e, "could not restore pairing");
        }
    }
}

/// Pair this device with the user's account (see `auth.rs` for the flow).
async fn link_device(app: AppHandle) {
    let state: State<'_, AppState> = app.state();
    let cfg = &state.firebase_config;

    let device_name = hostname();
    let platform = HostPlatform::detect().to_string();

    let pending = match crate::auth::begin_pairing(
        &cfg.database_url,
        &cfg.web_app_url,
        &device_name,
        &platform,
    )
    .await
    {
        Ok(p) => p,
        Err(e) => {
            tracing::error!(error = %e, "could not start device pairing");
            return;
        }
    };

    // Reuse the code window: the pairing code is shown the same way a session
    // code is, and the user is reading it off the screen either way.
    if let Err(e) = windows::open_code_window(&app, &pending.code) {
        tracing::warn!(error = %e, "could not open pairing window");
    }
    *state.display_code.write().await = Some(pending.code.clone());

    tracing::info!(
        code = %pending.code,
        url = %pending.verification_url,
        "enter this code at the verification URL to link the device"
    );

    match crate::auth::complete_pairing(
        &cfg.api_key,
        &cfg.database_url,
        &cfg.project_id,
        &pending.code,
    )
    .await
    {
        Ok(auth) => {
            tracing::info!(uid = %auth.uid(), "device linked");
            *state.auth.write().await = Some(Arc::new(Mutex::new(auth)));
            *state.display_code.write().await = None;
            windows::close_window(&app, "code-display");
        }
        Err(e) => {
            tracing::error!(error = %e, "device pairing failed");
            *state.display_code.write().await = None;
        }
    }
}

/// §1.1 CREATED → WAITING, then hand the session to the driver.
async fn start_session(app: AppHandle) {
    let state: State<'_, AppState> = app.state();

    let auth = match state.auth.read().await.clone() {
        Some(a) => a,
        None => {
            tracing::error!("cannot start a session — this device is not linked");
            return;
        }
    };

    // One session at a time (§8.6: one session = one host + one viewer).
    if let Some(existing) = state.session_task.lock().await.take() {
        existing.abort();
    }

    let driver = SessionDriver::new(auth, IceConfig::default());

    let (session_id, code) = match driver.create().await {
        Ok(v) => v,
        Err(e) => {
            tracing::error!(error = %e, "could not create session");
            return;
        }
    };

    // §3.4 — grouped "XXXX XXXX" so it survives being read aloud on a phone.
    let formatted = format_code(&code);
    *state.display_code.write().await = Some(formatted.clone());

    if let Err(e) = windows::open_code_window(&app, &formatted) {
        tracing::warn!(error = %e, "could not open code display window");
    }

    // §2.4 — the decision channel exists only while a decision is pending.
    let (decision_tx, decision_rx) = mpsc::channel::<bool>(1);
    *state.decision.lock().await = Some(decision_tx);

    let (events_tx, mut events_rx) = mpsc::unbounded_channel::<SessionEvent>();

    // Reflect driver events into the state the HTML windows poll.
    let app_for_events = app.clone();
    tauri::async_runtime::spawn(async move {
        let state: State<'_, AppState> = app_for_events.state();
        while let Some(event) = events_rx.recv().await {
            match event {
                SessionEvent::Status(status) => {
                    *state.status.write().await = status;
                }
                SessionEvent::ViewerVerified { email, .. } => {
                    *state.viewer_email.write().await = Some(email.clone());
                    // §2.4 — a native window, showing the verified email, with
                    // no default focus on Allow.
                    if let Err(e) = windows::open_allow_deny_window(&app_for_events, &email) {
                        tracing::error!(error = %e, "could not open Allow/Deny window — denying");
                        // Failing closed is the only safe direction here.
                        if let Some(tx) = state.decision.lock().await.as_ref() {
                            let _ = tx.send(false).await;
                        }
                    }
                }
                SessionEvent::Failed(reason) => {
                    tracing::error!(reason, "session failed");
                }
                SessionEvent::Ended => {
                    windows::close_window(&app_for_events, "allow-deny");
                    windows::close_window(&app_for_events, "code-display");
                    *state.display_code.write().await = None;
                    *state.viewer_email.write().await = None;
                    *state.decision.lock().await = None;
                }
                SessionEvent::Created { .. } => {}
            }
        }
    });

    let task = tauri::async_runtime::spawn(async move {
        driver.run(session_id, code, events_tx, decision_rx).await;
    });

    *state.session_task.lock().await = Some(task);
}

// ─── Tauri commands, called from the two HTML windows ───

/// §3.4 — the code display window polls this.
#[command]
pub async fn get_display_code(app: AppHandle) -> Result<String, String> {
    let state: State<'_, AppState> = app.state();
    Ok(state.display_code.read().await.clone().unwrap_or_default())
}

/// §3.4 — drives the "Waiting for connection…" / "Connected" label.
#[command]
pub async fn get_session_status(app: AppHandle) -> Result<String, String> {
    let state: State<'_, AppState> = app.state();
    Ok(state.status.read().await.to_string())
}

/// §2.4/§2.5 — the email shown in the Allow/Deny dialog. From verified JWT
/// claims, never from anything the viewer wrote to RTDB.
#[command]
pub async fn get_viewer_email(app: AppHandle) -> Result<String, String> {
    let state: State<'_, AppState> = app.state();
    Ok(state.viewer_email.read().await.clone().unwrap_or_default())
}

/// §2.4 — the host clicked Allow. The single most important action in the app.
#[command]
pub async fn handle_allow(app: AppHandle) -> Result<(), String> {
    send_decision(&app, true).await
}

/// §2.4 — the host clicked Deny.
#[command]
pub async fn handle_deny(app: AppHandle) -> Result<(), String> {
    send_decision(&app, false).await
}

async fn send_decision(app: &AppHandle, allowed: bool) -> Result<(), String> {
    let state: State<'_, AppState> = app.state();

    // Take the sender rather than borrowing it: a decision is single-use, so a
    // second click — or a replayed one from a window that was never closed —
    // finds nothing to send on.
    let tx = state.decision.lock().await.take();

    match tx {
        Some(tx) => {
            tracing::info!(allowed, "host decision recorded");
            tx.send(allowed)
                .await
                .map_err(|_| "The session is no longer waiting for a decision.".to_string())?;
            windows::close_window(app, "allow-deny");
            Ok(())
        }
        None => Err("No connection request is waiting for a decision.".to_string()),
    }
}

/// §1.1 — end the current session. Either peer can do this.
#[command]
pub async fn end_session(app: AppHandle) -> Result<(), String> {
    let state: State<'_, AppState> = app.state();

    if let Some(task) = state.session_task.lock().await.take() {
        task.abort();
    }
    *state.decision.lock().await = None;
    *state.display_code.write().await = None;
    *state.viewer_email.write().await = None;
    *state.status.write().await = SessionStatus::Ended;

    windows::close_window(&app, "allow-deny");
    windows::close_window(&app, "code-display");

    crate::crash_recovery::clear_marker();
    tracing::info!("session ended by host");
    Ok(())
}

/// Start a session from the UI as well as the tray menu.
#[command]
pub async fn generate_code(app: AppHandle) -> Result<String, String> {
    start_session(app.clone()).await;
    let state: State<'_, AppState> = app.state();
    Ok(state.display_code.read().await.clone().unwrap_or_default())
}

/// §3.4 — group an 8-digit code as "XXXX XXXX".
fn format_code(code: &str) -> String {
    if code.len() == 8 {
        format!("{} {}", &code[..4], &code[4..])
    } else {
        code.to_string()
    }
}

/// A human-recognisable name for this machine, shown when approving a pairing.
fn hostname() -> String {
    std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "Unknown device".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_code_groups_eight_digits() {
        assert_eq!(format_code("12345678"), "1234 5678");
    }

    #[test]
    fn format_code_leaves_other_lengths_alone() {
        // Pairing codes are six characters and must not be split.
        assert_eq!(format_code("AB3D9F"), "AB3D9F");
    }
}
