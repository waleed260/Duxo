//! Duxo Windows input injection — §0.5.
//!
//! enigo wrapping SendInput for full mouse/keyboard control.
//! §2.4 — NEVER injects input before ACTIVE state confirmed via the host's
//! own RTDB read, not the viewer's claim.

use crate::backend::{InputBackend, InputButton, InputState};
use crate::types::DuxoError;
use enigo::{Enigo, Mouse, Keyboard};

pub struct WindowsInput {
    enigo: Option<Enigo>,
    screen_width: u32,
    screen_height: u32,
}

impl WindowsInput {
    pub fn new() -> Self {
        Self {
            enigo: None,
            screen_width: 1920,
            screen_height: 1080,
        }
    }

    fn ensure_initialized(&mut self) -> Result<(), crate::types::DuxoError> {
        if self.enigo.is_some() {
            return Ok(());
        }

        let enigo = Enigo::new()
            .map_err(|e| DuxoError::Firebase(format!("Failed to initialize enigo: {e}")))?;

        // TODO: query Windows screen dimensions via GetSystemMetrics.
        self.enigo = Some(enigo);
        tracing::info!("Windows input backend initialized");
        Ok(())
    }

    fn map_coordinates(&self, x: f64, y: f64) -> (i32, i32) {
        let px = (x * self.screen_width as f64) as i32;
        let py = (y * self.screen_height as f64) as i32;
        (px.clamp(0, self.screen_width as i32), py.clamp(0, self.screen_height as i32))
    }
}

impl InputBackend for WindowsInput {
    fn mouse_move(&mut self, x: f64, y: f64) -> Result<(), crate::types::DuxoError> {
        self.ensure_initialized()?;
        let (px, py) = self.map_coordinates(x, y);

        if let Some(ref mut enigo) = self.enigo {
            enigo.mouse_move_to(px, py)
                .map_err(|e| DuxoError::Firebase(format!("Windows mouse_move failed: {e}")))?;
        }

        tracing::trace!(x = x, y = y, px = px, py = py, "mouse_move (windows)");
        Ok(())
    }

    fn mouse_click(&mut self, button: InputButton, state: InputState) -> Result<(), crate::types::DuxoError> {
        self.ensure_initialized()?;

        let enigo_button = match button {
            InputButton::Left => enigo::MouseButton::Left,
            InputButton::Right => enigo::MouseButton::Right,
            InputButton::Middle => enigo::MouseButton::Middle,
        };

        if let Some(ref mut enigo) = self.enigo {
            match state {
                InputState::Down => {
                    enigo.mouse_down(enigo_button)
                        .map_err(|e| DuxoError::Firebase(format!("Windows mouse_down failed: {e}")))?;
                }
                InputState::Up => {
                    enigo.mouse_up(enigo_button)
                        .map_err(|e| DuxoError::Firebase(format!("Windows mouse_up failed: {e}")))?;
                }
            }
        }

        tracing::trace!(?button, ?state, "mouse_click (windows)");
        Ok(())
    }

    fn key(&mut self, code: &str, state: InputState) -> Result<(), crate::types::DuxoError> {
        self.ensure_initialized()?;

        let enigo_key = map_windows_key(code);

        if let Some(ref mut enigo) = self.enigo {
            match state {
                InputState::Down => {
                    enigo.key_down(enigo_key)
                        .map_err(|e| DuxoError::Firebase(format!("Windows key_down failed: {e}")))?;
                }
                InputState::Up => {
                    enigo.key_up(enigo_key)
                        .map_err(|e| DuxoError::Firebase(format!("Windows key_up failed: {e}")))?;
                }
            }
        }

        tracing::trace!(code = code, ?state, "key_event (windows)");
        Ok(())
    }

    fn set_clipboard(&mut self, text: &str) -> Result<(), crate::types::DuxoError> {
        self.ensure_initialized()?;

        // §1.6 — never log clipboard text content (privacy).
        if let Some(ref mut enigo) = self.enigo {
            enigo.set_text(text)
                .map_err(|e| DuxoError::Firebase(format!("Windows clipboard failed: {e}")))?;
        }

        tracing::trace!("clipboard_text set (content not logged, §1.6)");
        Ok(())
    }
}

/// §1.4 — Map KeyboardEvent.code to enigo Key for Windows.
fn map_windows_key(code: &str) -> enigo::Key {
    match code {
        // Letters
        "KeyA" => enigo::Key::Layout('a'),
        "KeyB" => enigo::Key::Layout('b'),
        "KeyC" => enigo::Key::Layout('c'),
        "KeyD" => enigo::Key::Layout('d'),
        "KeyE" => enigo::Key::Layout('e'),
        "KeyF" => enigo::Key::Layout('f'),
        "KeyG" => enigo::Key::Layout('g'),
        "KeyH" => enigo::Key::Layout('h'),
        "KeyI" => enigo::Key::Layout('i'),
        "KeyJ" => enigo::Key::Layout('j'),
        "KeyK" => enigo::Key::Layout('k'),
        "KeyL" => enigo::Key::Layout('l'),
        "KeyM" => enigo::Key::Layout('m'),
        "KeyN" => enigo::Key::Layout('n'),
        "KeyO" => enigo::Key::Layout('o'),
        "KeyP" => enigo::Key::Layout('p'),
        "KeyQ" => enigo::Key::Layout('q'),
        "KeyR" => enigo::Key::Layout('r'),
        "KeyS" => enigo::Key::Layout('s'),
        "KeyT" => enigo::Key::Layout('t'),
        "KeyU" => enigo::Key::Layout('u'),
        "KeyV" => enigo::Key::Layout('v'),
        "KeyW" => enigo::Key::Layout('w'),
        "KeyX" => enigo::Key::Layout('x'),
        "KeyY" => enigo::Key::Layout('y'),
        "KeyZ" => enigo::Key::Layout('z'),

        // Digits
        "Digit0" => enigo::Key::Layout('0'),
        "Digit1" => enigo::Key::Layout('1'),
        "Digit2" => enigo::Key::Layout('2'),
        "Digit3" => enigo::Key::Layout('3'),
        "Digit4" => enigo::Key::Layout('4'),
        "Digit5" => enigo::Key::Layout('5'),
        "Digit6" => enigo::Key::Layout('6'),
        "Digit7" => enigo::Key::Layout('7'),
        "Digit8" => enigo::Key::Layout('8'),
        "Digit9" => enigo::Key::Layout('9'),

        // Special keys
        "Enter" => enigo::Key::Return,
        "Backspace" => enigo::Key::Backspace,
        "Tab" => enigo::Key::Tab,
        "Escape" => enigo::Key::Escape,
        "Space" => enigo::Key::Space,
        "Delete" => enigo::Key::Delete,
        "Insert" => enigo::Key::Insert,
        "Home" => enigo::Key::Home,
        "End" => enigo::Key::End,
        "PageUp" => enigo::Key::PageUp,
        "PageDown" => enigo::Key::PageDown,

        // Arrow keys
        "ArrowUp" => enigo::Key::ArrowUp,
        "ArrowDown" => enigo::Key::ArrowDown,
        "ArrowLeft" => enigo::Key::ArrowLeft,
        "ArrowRight" => enigo::Key::ArrowRight,

        // Function keys
        "F1" => enigo::Key::F1,
        "F2" => enigo::Key::F2,
        "F3" => enigo::Key::F3,
        "F4" => enigo::Key::F4,
        "F5" => enigo::Key::F5,
        "F6" => enigo::Key::F6,
        "F7" => enigo::Key::F7,
        "F8" => enigo::Key::F8,
        "F9" => enigo::Key::F9,
        "F10" => enigo::Key::F10,
        "F11" => enigo::Key::F11,
        "F12" => enigo::Key::F12,

        // Modifier keys
        "ShiftLeft" => enigo::Key::Shift,
        "ShiftRight" => enigo::Key::Shift,
        "ControlLeft" => enigo::Key::Control,
        "ControlRight" => enigo::Key::Control,
        "AltLeft" => enigo::Key::Alt,
        "AltRight" => enigo::Key::Alt,
        "MetaLeft" => enigo::Key::Super,
        "MetaRight" => enigo::Key::Super,
        "CapsLock" => enigo::Key::CapsLock,
        "NumLock" => enigo::Key::NumLock,

        // Punctuation
        "Minus" => enigo::Key::Layout('-'),
        "Equal" => enigo::Key::Layout('='),
        "BracketLeft" => enigo::Key::Layout('['),
        "BracketRight" => enigo::Key::Layout(']'),
        "Backslash" => enigo::Key::Layout('\\'),
        "Semicolon" => enigo::Key::Layout(';'),
        "Quote" => enigo::Key::Layout('\''),
        "Backquote" => enigo::Key::Layout('`'),
        "Comma" => enigo::Key::Layout(','),
        "Period" => enigo::Key::Layout('.'),
        "Slash" => enigo::Key::Layout('/'),

        // Fallback
        other => {
            tracing::warn!(code = other, "unknown keyboard code — mapped to no-op");
            enigo::Key::Layout('\0')
        }
    }
}
