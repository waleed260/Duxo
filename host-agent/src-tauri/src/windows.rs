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

use crate::types::{DuxoError, Result};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// §3.4 — Open the code display window showing the 8-digit code.
///
/// Replaces any window already carrying this label. Tauri's builder fails on a
/// duplicate label rather than reusing the window, and the caller only logs
/// that failure — so a leftover window from a previous session would stay on
/// screen showing *its* code while the new session waited for a different one.
/// The user reads the stale code aloud and the viewer lands on a session
/// nothing is driving.
pub fn open_code_window(app: &AppHandle, code: &str) -> Result<()> {
    close_window(app, "code-display");

    let _window = WebviewWindowBuilder::new(
        app,
        "code-display",
        WebviewUrl::App("code-display.html".into()),
    )
    .title(format!("Duxo — {code}"))
    .inner_size(420.0, 200.0)
    .resizable(false)
    .decorations(true)
    .center()
    .build()
    .map_err(|e| DuxoError::Window(format!("could not open the code window: {e}")))?;

    tracing::info!(code = %code, "code display window opened");
    Ok(())
}

/// §2.4 — Open the Allow/Deny popup window.
pub fn open_allow_deny_window(app: &AppHandle, viewer_email: &str) -> Result<()> {
    // Same label collision as the code window, and worse here: a stale dialog
    // shows the *previous* viewer's email, so the host would be approving a
    // connection request while reading someone else's name.
    close_window(app, "allow-deny");

    // The email comes from verified JWT claims (§2.5), but it still reaches the
    // window as a URL parameter, so it is encoded rather than interpolated raw.
    let url = format!(
        "allow-deny.html?email={}",
        urlencoding::encode(viewer_email)
    );

    let _window = WebviewWindowBuilder::new(app, "allow-deny", WebviewUrl::App(url.into()))
        .title("Duxo — Connection Request")
        .inner_size(440.0, 280.0)
        .resizable(false)
        .decorations(true)
        .center()
        .build()
        .map_err(|e| DuxoError::Window(format!("could not open the Allow/Deny window: {e}")))?;

    tracing::info!(viewer_email = %viewer_email, "allow/deny popup window opened");
    Ok(())
}

/// Close a named window if it exists.
pub fn close_window(app: &AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.close();
    }
}

// NOTE: `handle_session_after_allow` and `run_capture_pipeline` used to live
// here. They were dead code — nothing ever called either one, so clicking
// Allow started no WebRTC session and captured no frames. Both are now part of
// `signaling::SessionDriver`, which owns the whole lifecycle in one place and,
// unlike this module, carries no Tauri types and can be tested headlessly.
