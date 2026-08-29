//! Duxo input backend trait — §1.2.
//!
//! §1.2 — the host agent owns capture, WebRTC, input, and ALL permission
//! decisions. This trait is the contract between the data channel dispatch
//! (§10.3b) and the platform input implementation.
//!
//! §2.4 — input is gated: never called before ACTIVE is confirmed.
//!
//! The screen-capture trait that used to live here is gone. It required
//! `Send + Sync`, which `scrap::Capturer` cannot satisfy (it holds an `Rc` and
//! raw pointers into display-server memory), so it could never have been
//! implemented. Capture now owns a dedicated thread in `capture.rs` and needs
//! no trait at all — there is exactly one implementation.

use crate::types::Result;

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

/// Input injection.
///
/// §2.4 — NEVER inject input before ACTIVE state is confirmed via the host's
/// own RTDB read, not the viewer's claim.
///
/// `Send` but deliberately not `Sync`: injection is inherently serialized
/// through one display connection, and the one instance lives behind a mutex.
pub trait InputBackend: Send {
    /// Move the mouse to normalized coordinates (0–1 range, §1.4).
    fn mouse_move(&mut self, x: f64, y: f64) -> Result<()>;

    /// Press or release a mouse button.
    fn mouse_click(&mut self, button: InputButton, state: InputState) -> Result<()>;

    /// Scroll by a browser wheel delta (pixels, deltaMode 0).
    fn mouse_scroll(&mut self, dx: f64, dy: f64) -> Result<()>;

    /// Press or release a key by physical code (layout-independent).
    fn key(&mut self, code: &str, state: InputState) -> Result<()>;

    /// Put text on the remote machine.
    fn set_clipboard(&mut self, text: &str) -> Result<()>;
}

/// §1.2 — the input backend for this machine.
///
/// One instance per session, shared for its whole life. The previous code
/// built a fresh backend inside every dispatch function, opening a display
/// connection for every individual mouse move — 60 handshakes a second to
/// deliver 60 cursor positions.
pub fn platform_input() -> Result<Box<dyn InputBackend>> {
    Ok(Box::new(crate::input::EnigoInput::new()))
}
