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

use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{command, AppHandle, Manager, State};
use tokio::sync::{mpsc, Mutex, RwLock};

use crate::auth::HostAuth;
use crate::signaling::{SessionDriver, SessionEvent};
use crate::types::{HostPlatform, SessionStatus};
use crate::webrtc_host::IceConfig;
use crate::windows;

/// How long "End session" waits for the driver to finish its teardown writes
/// before giving up on a clean exit.
const SHUTDOWN_GRACE: std::time::Duration = std::time::Duration::from_secs(5);

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

/// Where a build with no configured web app sends someone who is pairing.
///
/// The dev server, deliberately — matching `.env.example`. A release always
/// sets `DUXO_WEB_APP_URL` explicitly and `release.yml` refuses to publish
/// without it, so the only builds that can reach this fallback are local ones,
/// and localhost is where those are pointed anyway.
///
/// It used to be `https://duxo.dev`, which does not resolve. `https://duxo.app`
/// is not the answer either: it resolves, but it serves an unrelated product
/// that shares the name, returning the same SPA shell for every path. Sending
/// someone mid-pairing to a stranger's site is worse than sending them
/// nowhere, so neither domain belongs here until Duxo actually owns one.
const DEFAULT_WEB_APP_URL: &str = "http://localhost:3000";

/// Runtime environment first, then the value baked in at compile time.
///
/// §7.1/§7.6 — a downloaded release is a *bare binary*: `release.yml` packages
/// the executable and nothing else, so there is no `.env` beside it and no
/// documented place for a user to put one. `load_env()` therefore finds
/// nothing, every value below comes back empty, and the agent starts up unable
/// to reach Firebase at all. The configuration has to be able to travel inside
/// the binary.
///
/// Baking it in is safe because none of it is secret: these are the same
/// public Firebase web-app values the viewer already ships in its client
/// bundle (see `.env.example`), and the only real credential the host ever
/// holds is the refresh token in the OS keychain (§2.6).
///
/// Runtime still wins, so `.env` and `cargo tauri dev` keep overriding a
/// baked-in default. An all-whitespace value counts as unset — an empty
/// `DUXO_FIREBASE_API_KEY=` line in a `.env` should fall through to the baked
/// value rather than blank it out.
fn from_runtime_or_baked(var: &str, baked: Option<&str>) -> String {
    if let Ok(value) = std::env::var(var) {
        if !value.trim().is_empty() {
            return value;
        }
    }
    baked.unwrap_or_default().trim().to_string()
}

impl FirebaseEnv {
    fn from_env() -> Self {
        // `option_env!` reads the variable when the crate is *compiled*.
        // build.rs emits a `rerun-if-env-changed` for each of these, so
        // changing one actually rebuilds instead of reusing a stale value.
        let web_app_url =
            from_runtime_or_baked("DUXO_WEB_APP_URL", option_env!("DUXO_WEB_APP_URL"));
        Self {
            api_key: from_runtime_or_baked(
                "DUXO_FIREBASE_API_KEY",
                option_env!("DUXO_FIREBASE_API_KEY"),
            ),
            database_url: from_runtime_or_baked(
                "DUXO_FIREBASE_DATABASE_URL",
                option_env!("DUXO_FIREBASE_DATABASE_URL"),
            ),
            project_id: from_runtime_or_baked(
                "DUXO_FIREBASE_PROJECT_ID",
                option_env!("DUXO_FIREBASE_PROJECT_ID"),
            ),
            web_app_url: if web_app_url.is_empty() {
                DEFAULT_WEB_APP_URL.to_string()
            } else {
                web_app_url
            },
        }
    }

    /// The variables that still have no value, named so the failure can say
    /// which ones rather than listing all three every time. Emptiness is the
    /// "is this configured?" test — a second accessor for that would be dead
    /// code in the binary, since nothing outside the tests would call it.
    fn missing(&self) -> Vec<&'static str> {
        let mut missing = Vec::new();
        if self.api_key.is_empty() {
            missing.push("DUXO_FIREBASE_API_KEY");
        }
        if self.database_url.is_empty() {
            missing.push("DUXO_FIREBASE_DATABASE_URL");
        }
        if self.project_id.is_empty() {
            missing.push("DUXO_FIREBASE_PROJECT_ID");
        }
        missing
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
    ///
    /// `tauri::async_runtime::JoinHandle`, not tokio's: the two are distinct
    /// types even though Tauri's runtime is tokio underneath.
    pub session_task: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
    /// §1.1 — asks the driver to wind the session down cleanly. Aborting the
    /// task instead skips `teardown`, which is what retires the code.
    pub shutdown: Mutex<Option<tokio::sync::watch::Sender<bool>>>,
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
            shutdown: Mutex::new(None),
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
    let missing = state.firebase_config.missing();
    let configured = missing.is_empty();
    app.manage(state);

    // §7.6 — every item is disabled on an unconfigured build. Leaving them
    // enabled was the worst of both worlds: clicking "Link this device…" runs
    // `begin_pairing` against an empty database URL, which fails inside
    // reqwest and is reported as a `tracing::error!` to a log file nobody is
    // watching. On screen, the menu item simply did nothing — the app looked
    // broken rather than unconfigured, and the two have very different fixes.
    let start = MenuItem::with_id(app, "start", "Start a session", configured, None::<&str>)?;
    let end = MenuItem::with_id(app, "end", "End session", configured, None::<&str>)?;
    let link = MenuItem::with_id(app, "link", "Link this device…", configured, None::<&str>)?;
    let unlink = MenuItem::with_id(
        app,
        "unlink",
        "Unlink this device",
        configured,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Duxo", true, None::<&str>)?;

    // The tray menu is the only UI this app has, so it is also the only place
    // the reason can be said. Disabled, because it is a statement rather than
    // an action.
    let status = MenuItem::with_id(
        app,
        "status",
        "Not configured — see the Duxo README",
        false,
        None::<&str>,
    )?;

    // `Menu::with_items` takes `&[&dyn IsMenuItem<R>]`. The list mixes
    // MenuItem and PredefinedMenuItem, so the first element needs the explicit
    // unsized coercion — inference cannot pick a single concrete type here.
    let mut items: Vec<&dyn IsMenuItem<tauri::Wry>> = vec![&start];
    if !configured {
        items.insert(0, &status);
        items.insert(1, &separator);
    }
    items.extend([
        &end as &dyn IsMenuItem<tauri::Wry>,
        &link,
        &unlink,
        &separator,
        &quit,
    ]);
    let menu = Menu::with_items(app, &items)?;

    let mut builder = TrayIconBuilder::with_id("duxo-tray")
        .menu(&menu)
        .tooltip(if configured {
            "Duxo — Remote Desktop Host"
        } else {
            "Duxo — not configured"
        })
        .on_menu_event(move |app, event| {
            let app = app.clone();
            match event.id.as_ref() {
                "start" => {
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = start_session(app).await {
                            tracing::error!(error = %e, "could not start a session");
                        }
                    });
                }
                "end" => {
                    tauri::async_runtime::spawn(async move {
                        let _ = end_session(app).await;
                    });
                }
                "link" => {
                    tauri::async_runtime::spawn(async move { link_device(app).await });
                }
                "unlink" => {
                    tauri::async_runtime::spawn(async move { unlink_device(app).await });
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
            missing = %missing.join(", "),
            "Firebase is not configured, so no session or pairing can start. \
             Set the listed variables in a .env beside the executable, or bake \
             them in at build time (see release.yml)."
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
        Ok(Some(mut auth)) => {
            tracing::info!(uid = %auth.uid(), "device already linked");
            retire_abandoned_session(&mut auth).await;
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

/// §1.1/§6.2 — retire whatever the previous run left behind in RTDB.
///
/// `SessionDriver::teardown` ends the session and deletes the code on every
/// path out of `run`, but a hard kill — closing the lid, killing the process,
/// losing power — reaches none of them. What survives is the crash marker, and
/// this is the first moment there is a token to act on it with.
///
/// Both writes are best-effort. Failing to tidy up a dead session must not
/// stop a device that is otherwise ready from linking.
async fn retire_abandoned_session(auth: &mut HostAuth) {
    let marker = match crate::crash_recovery::read_marker() {
        Ok(Some(marker)) => marker,
        Ok(None) => return,
        Err(e) => {
            tracing::warn!(error = %e, "could not read the crash marker");
            return;
        }
    };

    let Ok(token) = auth.id_token().await else {
        // Deliberately leaves the marker in place: with no token nothing can
        // be retired, and the next launch is the next chance to try.
        tracing::warn!(
            session_id = %marker.session_id,
            "no token yet — leaving the abandoned session for the next launch"
        );
        return;
    };
    let db = auth.database_url().to_string();
    let project = auth.project_id().to_string();

    if let Err(e) = crate::firebase::end_session(&db, &token, &project, &marker.session_id).await {
        tracing::warn!(error = %e, "could not end the abandoned session");
    }

    // A marker written by an older build carries no code. Nothing to retire.
    if let Some(code) = marker.code.as_deref() {
        if let Err(e) = crate::firebase::delete_code(&db, &token, code).await {
            tracing::warn!(error = %e, "could not retire the abandoned code");
        }
    }

    crate::crash_recovery::clear_marker();
    tracing::info!(
        session_id = %marker.session_id,
        "retired the previous run's abandoned session"
    );
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

/// §8.2 — forget this device's pairing.
///
/// Ends any running session first: leaving one live after dropping the
/// credential it depends on would just fail every subsequent RTDB write.
async fn unlink_device(app: AppHandle) {
    let _ = end_session(app.clone()).await;

    let state: State<'_, AppState> = app.state();
    let auth = state.auth.write().await.take();

    match auth {
        Some(auth) => {
            let guard = auth.lock().await;
            match guard.sign_out() {
                Ok(()) => tracing::info!("device unlinked — pair again to host sessions"),
                Err(e) => tracing::error!(error = %e, "could not clear the stored credential"),
            }
        }
        None => tracing::info!("device was not linked"),
    }
}

/// §1.1 CREATED → WAITING, then hand the session to the driver.
async fn start_session(app: AppHandle) -> crate::types::Result<String> {
    let state: State<'_, AppState> = app.state();

    let auth = match state.auth.read().await.clone() {
        Some(a) => a,
        None => {
            tracing::error!("cannot start a session — this device is not linked");
            return Err(crate::types::DuxoError::NotAuthenticated);
        }
    };

    // One session at a time (§8.6: one session = one host + one viewer).
    //
    // `abort()` drops the future where it stands, so the driver's `teardown`
    // never runs: the previous session's node is left un-ended and, worse, its
    // code is never retired — it stays redeemable in `codes/` pointing at a
    // session nothing is driving any more. Ending it properly first is what
    // makes "Start a session" twice in a row safe.
    // Bind before the `if`: a MutexGuard temporary created inside the
    // condition can live until the end of the enclosing statement, which
    // includes the body — and `end_session` locks the same mutex. Holding it
    // across that call is a deadlock that only shows up on the second
    // "Start a session", where the UI simply stops responding.
    let previous_session_running = state.session_task.lock().await.is_some();
    if previous_session_running {
        tracing::info!("ending the previous session before starting a new one");
        let _ = end_session(app.clone()).await;
    }

    let driver = SessionDriver::new(auth, IceConfig::default());

    let (session_id, code) = driver.create().await.inspect_err(|e| {
        tracing::error!(error = %e, "could not create session");
    })?;

    // §3.4 — grouped "XXXX XXXX" so it survives being read aloud on a phone.
    let formatted = format_code(&code);
    *state.display_code.write().await = Some(formatted.clone());

    if let Err(e) = windows::open_code_window(&app, &formatted) {
        tracing::warn!(error = %e, "could not open code display window");
    }

    // §2.4 — the decision channel exists only while a decision is pending.
    let (decision_tx, decision_rx) = mpsc::channel::<bool>(1);
    *state.decision.lock().await = Some(decision_tx);

    let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);
    *state.shutdown.lock().await = Some(shutdown_tx);

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
                SessionEvent::ViewerVerified {
                    email,
                    uid,
                    email_verified,
                    capabilities,
                } => {
                    // §6.1 — what the two sides actually agreed on. Worth a
                    // log line: a viewer silently losing clipboard or file
                    // transfer to a version mismatch is otherwise indis-
                    // tinguishable from the feature being broken.
                    tracing::info!(
                        viewer_uid = %uid,
                        email_verified,
                        negotiated = ?capabilities,
                        "viewer verified — awaiting the host's decision"
                    );
                    *state.viewer_email.write().await = Some(email.clone());
                    // §2.4 — a native window, showing the verified email, with
                    // no default focus on Allow.
                    if let Err(e) =
                        windows::open_allow_deny_window(&app_for_events, &email, email_verified)
                    {
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
                SessionEvent::Created { session_id, code } => {
                    // The tray already published the code to the window; this
                    // is the correlation id every later log line for this
                    // session is grouped by.
                    tracing::info!(%session_id, code_len = code.len(), "session created");
                }
            }
        }
    });

    let task = tauri::async_runtime::spawn(async move {
        driver
            .run(session_id, code, events_tx, decision_rx, shutdown_rx)
            .await;
    });

    *state.session_task.lock().await = Some(task);
    Ok(formatted)
}

// ─── Tauri commands, called from the two HTML windows ───

/// §3.4 — the code display window polls this.
#[command]
pub async fn get_display_code(app: AppHandle) -> Result<String, String> {
    let state: State<'_, AppState> = app.state();
    // Bind before returning: a guard living in the tail expression is dropped
    // after `state`, which borrows `app` — so it must not be part of the
    // returned expression.
    let value = state.display_code.read().await.clone().unwrap_or_default();
    Ok(value)
}

/// §3.4 — drives the "Waiting for connection…" / "Connected" label.
#[command]
pub async fn get_session_status(app: AppHandle) -> Result<String, String> {
    let state: State<'_, AppState> = app.state();
    let status = state.status.read().await.to_string();
    Ok(status)
}

/// §2.4/§2.5 — the email shown in the Allow/Deny dialog. From verified JWT
/// claims, never from anything the viewer wrote to RTDB.
#[command]
pub async fn get_viewer_email(app: AppHandle) -> Result<String, String> {
    let state: State<'_, AppState> = app.state();
    // Bind before returning: a guard living in the tail expression is dropped
    // after `state`, which borrows `app` — so it must not be part of the
    // returned expression.
    let value = state.viewer_email.read().await.clone().unwrap_or_default();
    Ok(value)
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

    // Ask first, abort only as a backstop. `teardown` is what writes the
    // session to ENDED and retires the code so it can never be redeemed
    // again; an abort skips it, leaving a live code pointing at a session
    // nothing is driving.
    if let Some(tx) = state.shutdown.lock().await.take() {
        let _ = tx.send(true);
    }

    if let Some(task) = state.session_task.lock().await.take() {
        // The driver polls the signal once a second, so this is the time it
        // needs to notice, finish its RTDB writes and return. If it overruns,
        // fall back to abort rather than hanging the tray on a stuck network
        // call — a leaked code is better than a frozen UI.
        match tokio::time::timeout(SHUTDOWN_GRACE, task).await {
            Ok(_) => tracing::info!("session ended cleanly"),
            Err(_) => tracing::warn!(
                "session did not wind down in {}s — the code may stay redeemable",
                SHUTDOWN_GRACE.as_secs()
            ),
        }
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
    // Returning the error text rather than an empty string: a code window
    // showing nothing, with the reason only in a log file, is the worst of
    // both worlds for whoever is sitting at the machine.
    start_session(app).await.map_err(|e| e.to_string())
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

    // Each test below uses its own variable name. `std::env::var` is process
    // global and cargo runs tests in threads, so sharing one name between two
    // tests makes them flake against each other rather than fail honestly.

    #[test]
    fn runtime_env_beats_the_baked_value() {
        std::env::set_var("DUXO_TEST_RUNTIME_WINS", "from-runtime");
        assert_eq!(
            from_runtime_or_baked("DUXO_TEST_RUNTIME_WINS", Some("from-build")),
            "from-runtime"
        );
        std::env::remove_var("DUXO_TEST_RUNTIME_WINS");
    }

    #[test]
    fn baked_value_is_used_when_nothing_is_set() {
        // This is the released-binary case: the archive carries no `.env`, so
        // `load_env()` finds nothing and the compile-time value is all there is.
        assert_eq!(
            from_runtime_or_baked("DUXO_TEST_UNSET_ENTIRELY", Some("from-build")),
            "from-build"
        );
    }

    #[test]
    fn an_empty_runtime_value_falls_through_to_the_baked_one() {
        // `DUXO_FIREBASE_API_KEY=` on its own line in a .env — as .env.example
        // ships it — sets the variable to "". Treating that as an override
        // would let a copied template blank out a working baked-in build.
        std::env::set_var("DUXO_TEST_BLANK_VALUE", "   ");
        assert_eq!(
            from_runtime_or_baked("DUXO_TEST_BLANK_VALUE", Some("from-build")),
            "from-build"
        );
        std::env::remove_var("DUXO_TEST_BLANK_VALUE");
    }

    #[test]
    fn nothing_anywhere_is_empty_not_a_panic() {
        assert_eq!(from_runtime_or_baked("DUXO_TEST_NO_VALUE_AT_ALL", None), "");
    }

    #[test]
    fn missing_names_only_the_variables_that_are_actually_unset() {
        let env = FirebaseEnv {
            api_key: "key".into(),
            database_url: String::new(),
            project_id: String::new(),
            web_app_url: DEFAULT_WEB_APP_URL.into(),
        };
        assert_eq!(
            env.missing(),
            vec!["DUXO_FIREBASE_DATABASE_URL", "DUXO_FIREBASE_PROJECT_ID"]
        );
    }

    #[test]
    fn a_fully_populated_env_is_configured() {
        let env = FirebaseEnv {
            api_key: "key".into(),
            database_url: "https://x-default-rtdb.firebaseio.com".into(),
            project_id: "duxo".into(),
            web_app_url: "https://example.invalid".into(),
        };
        assert!(env.missing().is_empty());
    }

    #[test]
    fn web_app_url_never_ends_up_empty() {
        // auth.rs builds "{web_app_url}/link-device" and shows it to the person
        // pairing the device. An empty base would render "/link-device", which
        // is not somewhere anyone can go.
        let env = FirebaseEnv::from_env();
        assert!(!env.web_app_url.is_empty());
    }
}
