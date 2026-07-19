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
