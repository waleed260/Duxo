//! Duxo shared backend traits — platform-independent interfaces for
//! screen capture and input injection.
//!
//! §1.2 — the host agent owns capture, WebRTC, input, and ALL permission
//! decisions. These traits define the contract between the WebRTC data channel
//! dispatch (§10.3b) and the platform-specific implementations.
//!
//! §2.4 — input traits are gated: NEVER called before ACTIVE confirmed.

use crate::types::Result;

// ─── Capture ───

/// A captured frame from the desktop.
#[derive(Debug, Clone)]
pub struct CapturedFrame {
    pub width: u32,
    pub height: u32,
    /// BGRA pixel data (Windows) or RGBA (Linux).
    pub data: Vec<u8>,
    pub timestamp_ns: i64,
}

/// Capture backend trait — shared interface across platforms.
pub trait CaptureBackend: Send + Sync {
    /// Start capturing. Returns a frame stream consumer.
    fn start(&mut self) -> Result<()>;

    /// Grab the next frame from the desktop.
    /// Returns raw pixel data (BGRA) + dimensions.
    fn next_frame(&mut self) -> Result<CapturedFrame>;

    /// Stop capturing and release resources.
    fn stop(&mut self) -> Result<()>;
}

// ─── Input ───

/// Mouse button identifiers — shared across all platforms.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InputButton {
    Left,
    Right,
    Middle,
}

/// Input state — press or release.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InputState {
    Down,
    Up,
}

/// Input backend trait — shared interface across platforms.
///
/// §2.4 — NEVER inject input before ACTIVE state confirmed via the host's
/// own RTDB read, not the viewer's claim.
pub trait InputBackend: Send + Sync {
    /// Move the mouse to normalized coordinates (0–1 range, §1.4).
    fn mouse_move(&mut self, x: f64, y: f64) -> Result<()>;

    /// Click a mouse button.
    fn mouse_click(&mut self, button: InputButton, state: InputState) -> Result<()>;

    /// Press or release a keyboard key by physical code (layout-independent).
    fn key(&mut self, code: &str, state: InputState) -> Result<()>;

    /// Set clipboard text.
    fn set_clipboard(&mut self, text: &str) -> Result<()>;
}

/// §1.2 — construct the input backend for the machine we are running on.
///
/// One instance is created per session and shared for its whole life. The
/// previous code built a fresh backend inside every dispatch function, which
/// meant opening an X11 connection and re-querying the display geometry for
/// every individual mouse move — at 60 moves/second that is 60 display
/// handshakes a second to deliver 60 cursor positions.
pub fn platform_input() -> Result<Box<dyn InputBackend>> {
    #[cfg(target_os = "windows")]
    {
        Ok(Box::new(crate::input_windows::WindowsInput::new()))
    }

    #[cfg(target_os = "linux")]
    {
        // §0.2 — Wayland has no input-injection path in the MVP. The session
        // is still useful read-only, so we do not fail here; the host
        // advertises `linux-wayland` and the viewer hides its input affordances.
        Ok(Box::new(crate::input_linux_x11::X11Input::new()))
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        Err(crate::types::DuxoError::CaptureBackendUnavailable)
    }
}

/// §1.2 — construct the screen-capture backend for this machine.
pub fn platform_capture() -> Result<Box<dyn CaptureBackend>> {
    #[cfg(target_os = "windows")]
    {
        Ok(Box::new(crate::capture_windows::WindowsCapture::new()))
    }

    #[cfg(target_os = "linux")]
    {
        if std::env::var("WAYLAND_DISPLAY").is_ok() && std::env::var("DISPLAY").is_err() {
            // §0.2 — Wayland capture goes through xdg-desktop-portal + PipeWire
            // and is Phase 5. With XWayland present (DISPLAY set) scrap still
            // works, so only a pure-Wayland session is genuinely unsupported.
            // Say why, rather than reporting a bare "backend unavailable" that
            // reads as a bug in Duxo rather than a scoped limitation.
            return Err(crate::types::DuxoError::Capture(
                "this is a Wayland session with no XWayland display. Duxo can \
                 only capture X11 sessions for now — log out and choose an \
                 \"Xorg\" or \"X11\" session at the login screen"
                    .to_string(),
            ));
        }
        Ok(Box::new(crate::capture_linux_x11::X11Capture::new()))
    }

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        Err(crate::types::DuxoError::CaptureBackendUnavailable)
    }
}
