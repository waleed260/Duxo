//! Duxo input injection — §1.4 data channel messages → OS input events.
//!
//! REPLACES `input_linux_x11.rs` and `input_windows.rs`, which were two
//! near-identical copies differing only in their log strings. enigo 0.2 is a
//! single cross-platform trait API — `Mouse` and `Keyboard` behave the same on
//! X11 (XTest) and Windows (SendInput) — so the split bought nothing and cost
//! every keycode mapping being maintained twice. Both copies also targeted the
//! enigo 0.1 API (`mouse_move_to`, `key_down`, `Key::Layout`, `MouseButton`),
//! none of which exists in 0.2; between them they accounted for 55 of the 82
//! compile errors in the first real build.
//!
//! §1.4 — coordinates arrive normalized 0–1 and are multiplied by the host's
//! own screen size here. That is the whole point of normalizing: the viewer
//! never needs to know the host's resolution or DPI.
//!
//! §1.7 — never log key *identities*, only that a key event happened. A log
//! that records which keys were pressed is a keylogger artifact on disk.

use enigo::{Axis, Button, Coordinate, Direction, Enigo, Key, Keyboard, Mouse, Settings};

use crate::backend::{InputBackend, InputButton, InputState};
use crate::types::{DuxoError, Result};

/// §1.4 — browser wheel pixels per enigo scroll notch. The de-facto standard
/// deltaY for one wheel click in every major browser.
const PIXELS_PER_NOTCH: f64 = 100.0;

pub struct EnigoInput {
    /// Created lazily: constructing an Enigo opens a display connection, and
    /// doing that at session-setup time would fail the whole session on a
    /// machine that can still usefully stream read-only.
    enigo: Option<Enigo>,
    screen_width: i32,
    screen_height: i32,
    /// §1.4 — leftover wheel pixels between events.
    ///
    /// Browsers report deltaMode 0 (pixels) and enigo counts notches, so the
    /// conversion divides by ~100. Rounding each event independently threw
    /// away everything under half a notch, which is most of what a trackpad
    /// or a smooth-scrolling wheel produces: a stream of 8px events each
    /// rounded to zero, and scrolling that simply did nothing. Carrying the
    /// remainder means small deltas accumulate until they add up to a notch.
    scroll_remainder_x: f64,
    scroll_remainder_y: f64,
}

impl EnigoInput {
    pub fn new() -> Self {
        Self {
            enigo: None,
            screen_width: 0,
            screen_height: 0,
            scroll_remainder_x: 0.0,
            scroll_remainder_y: 0.0,
        }
    }

    fn enigo(&mut self) -> Result<&mut Enigo> {
        if self.enigo.is_none() {
            let enigo = Enigo::new(&Settings::default())
                .map_err(|e| DuxoError::Input(format!("could not open input backend: {e}")))?;

            // enigo reports the display size itself, on both platforms. The
            // previous code asked scrap on Linux and hardcoded 1920×1080 on
            // Windows, which put the cursor in the wrong place on every
            // Windows machine that was not exactly 1080p.
            let (w, h) = enigo
                .main_display()
                .map_err(|e| DuxoError::Input(format!("could not read display size: {e}")))?;

            self.screen_width = w;
            self.screen_height = h;
            self.enigo = Some(enigo);

            tracing::info!(
                screen_width = w,
                screen_height = h,
                "input backend initialised"
            );
        }
        Ok(self.enigo.as_mut().expect("just initialised"))
    }

    /// Convert a pixel wheel delta into whole notches, banking the remainder.
    ///
    /// Returns `(vertical, horizontal)`. Truncation is toward zero so equal
    /// and opposite scrolling nets to zero rather than drifting.
    fn take_scroll_notches(&mut self, dx: f64, dy: f64) -> (i32, i32) {
        let total_y = self.scroll_remainder_y + dy / PIXELS_PER_NOTCH;
        let total_x = self.scroll_remainder_x + dx / PIXELS_PER_NOTCH;
        let whole_y = total_y.trunc();
        let whole_x = total_x.trunc();
        self.scroll_remainder_y = total_y - whole_y;
        self.scroll_remainder_x = total_x - whole_x;
        (whole_y as i32, whole_x as i32)
    }

    /// §1.4 — normalized 0–1 → absolute screen pixels.
    fn to_pixels(&self, x: f64, y: f64) -> (i32, i32) {
        // Clamp to the last addressable pixel, not to the width: on a 1920-wide
        // screen, x=1.0 maps to 1920, which is off-screen by one and is
        // rejected or silently clamped differently by each platform.
        let px = (x * self.screen_width as f64).round() as i32;
        let py = (y * self.screen_height as f64).round() as i32;
        (
            px.clamp(0, (self.screen_width - 1).max(0)),
            py.clamp(0, (self.screen_height - 1).max(0)),
        )
    }
}

impl Default for EnigoInput {
    fn default() -> Self {
        Self::new()
    }
}

impl InputBackend for EnigoInput {
    fn mouse_move(&mut self, x: f64, y: f64) -> Result<()> {
        self.enigo()?;
        let (px, py) = self.to_pixels(x, y);
        let enigo = self.enigo.as_mut().expect("initialised above");
        enigo
            .move_mouse(px, py, Coordinate::Abs)
            .map_err(|e| DuxoError::Input(format!("mouse_move failed: {e}")))
    }

    fn mouse_click(&mut self, button: InputButton, state: InputState) -> Result<()> {
        let enigo = self.enigo()?;
        let button = match button {
            InputButton::Left => Button::Left,
            InputButton::Right => Button::Right,
            InputButton::Middle => Button::Middle,
        };
        enigo
            .button(button, direction(state))
            .map_err(|e| DuxoError::Input(format!("mouse_click failed: {e}")))
    }

    fn mouse_scroll(&mut self, dx: f64, dy: f64) -> Result<()> {
        // Browsers report wheel deltas in pixels (deltaMode 0) — typically
        // ~100 per notch — while enigo counts notches. Sending the raw delta
        // would scroll roughly a hundred lines per flick.
        //
        // The remainder is carried between events rather than rounded away.
        // `(dy / 100.0).round()` is zero for anything under 50px, which is
        // most trackpad and smooth-wheel input, so scrolling from those
        // devices produced no movement at all — not jerky, none.
        let (notches_y, notches_x) = self.take_scroll_notches(dx, dy);

        if notches_y == 0 && notches_x == 0 {
            // Nothing whole yet; the fraction is banked for the next event.
            return Ok(());
        }

        let enigo = self.enigo()?;

        if notches_y != 0 {
            enigo
                .scroll(notches_y, Axis::Vertical)
                .map_err(|e| DuxoError::Input(format!("scroll failed: {e}")))?;
        }
        if notches_x != 0 {
            enigo
                .scroll(notches_x, Axis::Horizontal)
                .map_err(|e| DuxoError::Input(format!("scroll failed: {e}")))?;
        }
        Ok(())
    }

    fn key(&mut self, code: &str, state: InputState) -> Result<()> {
        let Some(key) = map_key_code(code) else {
            // §6.1 — an unmapped key from a newer viewer, or a key this
            // platform has no equivalent for, is dropped rather than fatal.
            tracing::debug!("unmapped key code — ignoring");
            return Ok(());
        };
        let enigo = self.enigo()?;
        enigo
            .key(key, direction(state))
            .map_err(|e| DuxoError::Input(format!("key event failed: {e}")))
    }

    fn set_clipboard(&mut self, text: &str) -> Result<()> {
        // enigo has no clipboard API; it types text. That is not the same
        // thing, but it is the behaviour the previous implementation had and
        // it does get the text onto the remote machine. A real clipboard
        // write needs an X11 selection owner / OpenClipboard, which means
        // holding a window — deferred rather than faked more convincingly.
        let enigo = self.enigo()?;
        enigo
            .text(text)
            .map_err(|e| DuxoError::Input(format!("clipboard text failed: {e}")))
    }
}

fn direction(state: InputState) -> Direction {
    match state {
        InputState::Down => Direction::Press,
        InputState::Up => Direction::Release,
    }
}

/// §1.4 — browser `KeyboardEvent.code` → enigo key.
///
/// `code` is the *physical* key, so this mapping is layout-independent: the
/// viewer reports "the key where QWERTY has A" and the host's own layout
/// decides what that produces. Letters and digits therefore map to their
/// unshifted character and let the host apply its own modifiers — sending
/// 'A' directly would produce a capital even with Shift up.
pub fn map_key_code(code: &str) -> Option<Key> {
    // Letters: "KeyA" → 'a'
    if let Some(letter) = code.strip_prefix("Key") {
        let mut chars = letter.chars();
        if let (Some(c), None) = (chars.next(), chars.next()) {
            if c.is_ascii_alphabetic() {
                return Some(Key::Unicode(c.to_ascii_lowercase()));
            }
        }
    }

    // Top-row digits: "Digit7" → '7'
    if let Some(digit) = code.strip_prefix("Digit") {
        let mut chars = digit.chars();
        if let (Some(c), None) = (chars.next(), chars.next()) {
            if c.is_ascii_digit() {
                return Some(Key::Unicode(c));
            }
        }
    }

    Some(match code {
        "Escape" => Key::Escape,
        "Tab" => Key::Tab,
        "CapsLock" => Key::CapsLock,
        "Space" => Key::Space,
        "Enter" | "NumpadEnter" => Key::Return,
        "Backspace" => Key::Backspace,
        "Delete" => Key::Delete,
        "Insert" => Key::Insert,
        "Home" => Key::Home,
        "End" => Key::End,
        "PageUp" => Key::PageUp,
        "PageDown" => Key::PageDown,

        "ArrowUp" => Key::UpArrow,
        "ArrowDown" => Key::DownArrow,
        "ArrowLeft" => Key::LeftArrow,
        "ArrowRight" => Key::RightArrow,

        // Left and right modifiers both map to the generic key: the
        // side-specific variants are not available on every platform, and no
        // application distinguishes them for the purpose of a chord.
        "ShiftLeft" | "ShiftRight" => Key::Shift,
        "ControlLeft" | "ControlRight" => Key::Control,
        "AltLeft" | "AltRight" => Key::Alt,
        "MetaLeft" | "MetaRight" => Key::Meta,
        // The context-menu key exists only in enigo's Windows key set.
        #[cfg(target_os = "windows")]
        "ContextMenu" => Key::Apps,

        // Punctuation, by physical position on a US layout.
        "Minus" => Key::Unicode('-'),
        "Equal" => Key::Unicode('='),
        "BracketLeft" => Key::Unicode('['),
        "BracketRight" => Key::Unicode(']'),
        "Backslash" => Key::Unicode('\\'),
        "Semicolon" => Key::Unicode(';'),
        "Quote" => Key::Unicode('\''),
        "Backquote" => Key::Unicode('`'),
        "Comma" => Key::Unicode(','),
        "Period" => Key::Unicode('.'),
        "Slash" => Key::Unicode('/'),

        "F1" => Key::F1,
        "F2" => Key::F2,
        "F3" => Key::F3,
        "F4" => Key::F4,
        "F5" => Key::F5,
        "F6" => Key::F6,
        "F7" => Key::F7,
        "F8" => Key::F8,
        "F9" => Key::F9,
        "F10" => Key::F10,
        "F11" => Key::F11,
        "F12" => Key::F12,

        // enigo exposes dedicated numpad keys only on Windows. Elsewhere the
        // characters they produce are the useful part, and Unicode gets them
        // — what is lost is the distinction between the numpad and top-row
        // keys, which almost nothing acts on.
        #[cfg(target_os = "windows")]
        "Numpad0" => Key::Numpad0,
        #[cfg(target_os = "windows")]
        "Numpad1" => Key::Numpad1,
        #[cfg(target_os = "windows")]
        "Numpad2" => Key::Numpad2,
        #[cfg(target_os = "windows")]
        "Numpad3" => Key::Numpad3,
        #[cfg(target_os = "windows")]
        "Numpad4" => Key::Numpad4,
        #[cfg(target_os = "windows")]
        "Numpad5" => Key::Numpad5,
        #[cfg(target_os = "windows")]
        "Numpad6" => Key::Numpad6,
        #[cfg(target_os = "windows")]
        "Numpad7" => Key::Numpad7,
        #[cfg(target_os = "windows")]
        "Numpad8" => Key::Numpad8,
        #[cfg(target_os = "windows")]
        "Numpad9" => Key::Numpad9,
        #[cfg(target_os = "windows")]
        "NumpadAdd" => Key::Add,
        #[cfg(target_os = "windows")]
        "NumpadSubtract" => Key::Subtract,
        #[cfg(target_os = "windows")]
        "NumpadMultiply" => Key::Multiply,
        #[cfg(target_os = "windows")]
        "NumpadDivide" => Key::Divide,
        #[cfg(target_os = "windows")]
        "NumpadDecimal" => Key::Decimal,

        #[cfg(not(target_os = "windows"))]
        "Numpad0" => Key::Unicode('0'),
        #[cfg(not(target_os = "windows"))]
        "Numpad1" => Key::Unicode('1'),
        #[cfg(not(target_os = "windows"))]
        "Numpad2" => Key::Unicode('2'),
        #[cfg(not(target_os = "windows"))]
        "Numpad3" => Key::Unicode('3'),
        #[cfg(not(target_os = "windows"))]
        "Numpad4" => Key::Unicode('4'),
        #[cfg(not(target_os = "windows"))]
        "Numpad5" => Key::Unicode('5'),
        #[cfg(not(target_os = "windows"))]
        "Numpad6" => Key::Unicode('6'),
        #[cfg(not(target_os = "windows"))]
        "Numpad7" => Key::Unicode('7'),
        #[cfg(not(target_os = "windows"))]
        "Numpad8" => Key::Unicode('8'),
        #[cfg(not(target_os = "windows"))]
        "Numpad9" => Key::Unicode('9'),
        #[cfg(not(target_os = "windows"))]
        "NumpadAdd" => Key::Unicode('+'),
        #[cfg(not(target_os = "windows"))]
        "NumpadSubtract" => Key::Unicode('-'),
        #[cfg(not(target_os = "windows"))]
        "NumpadMultiply" => Key::Unicode('*'),
        #[cfg(not(target_os = "windows"))]
        "NumpadDivide" => Key::Unicode('/'),
        #[cfg(not(target_os = "windows"))]
        "NumpadDecimal" => Key::Unicode('.'),

        "NumLock" => Key::Numlock,
        "PrintScreen" => Key::Print,
        // ScrollLock is the mirror case: enigo has it on unix, not on Windows.
        #[cfg(not(target_os = "windows"))]
        "ScrollLock" => Key::ScrollLock,

        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn letters_map_to_lowercase_unicode() {
        // Uppercase would produce a capital regardless of Shift, breaking
        // every unshifted keystroke.
        assert_eq!(map_key_code("KeyA"), Some(Key::Unicode('a')));
        assert_eq!(map_key_code("KeyZ"), Some(Key::Unicode('z')));
    }

    #[test]
    fn digits_map_to_their_character() {
        assert_eq!(map_key_code("Digit0"), Some(Key::Unicode('0')));
        assert_eq!(map_key_code("Digit9"), Some(Key::Unicode('9')));
    }

    #[test]
    fn prefix_matching_does_not_overreach() {
        // "Keyboard" and "DigitalFoo" start with the prefixes but are not
        // single-character keys; a naive strip_prefix would map them.
        assert_eq!(map_key_code("Keyboard"), None);
        assert_eq!(map_key_code("Key"), None);
        assert_eq!(map_key_code("Digit12"), None);
    }

    #[test]
    fn both_sides_of_a_modifier_map_to_the_same_key() {
        assert_eq!(map_key_code("ShiftLeft"), map_key_code("ShiftRight"));
        assert_eq!(map_key_code("ControlLeft"), Some(Key::Control));
        assert_eq!(map_key_code("MetaRight"), Some(Key::Meta));
    }

    #[test]
    fn numpad_enter_is_still_enter() {
        assert_eq!(map_key_code("NumpadEnter"), map_key_code("Enter"));
    }

    #[test]
    fn numpad_digits_are_mapped_on_every_platform() {
        // enigo's dedicated Numpad* variants are Windows-only, so the non-
        // Windows build takes a Unicode fallback. Either way the key must not
        // fall through to None — that would silently drop numpad input.
        for code in [
            "Numpad0",
            "Numpad5",
            "Numpad9",
            "NumpadAdd",
            "NumpadDecimal",
        ] {
            assert!(map_key_code(code).is_some(), "{code} must map");
        }
    }

    #[test]
    fn unknown_codes_are_dropped_not_guessed() {
        assert_eq!(map_key_code("Fn"), None);
        assert_eq!(map_key_code(""), None);
        assert_eq!(map_key_code("LaunchMoonBase"), None);
    }

    #[test]
    fn arrows_use_enigos_own_naming() {
        // enigo calls these UpArrow/DownArrow, not ArrowUp/ArrowDown — the
        // reverse of the browser's naming, and the source of six of the
        // original compile errors.
        assert_eq!(map_key_code("ArrowUp"), Some(Key::UpArrow));
        assert_eq!(map_key_code("ArrowRight"), Some(Key::RightArrow));
    }

    #[test]
    fn normalized_coordinates_stay_on_screen() {
        let input = EnigoInput {
            screen_width: 1920,
            screen_height: 1080,
            // Spread the real constructor rather than listing every field:
            // these tests are about coordinate mapping, and adding a field to
            // the struct should not break them the way `scroll_remainder_*`
            // did.
            ..EnigoInput::new()
        };
        assert_eq!(input.to_pixels(0.0, 0.0), (0, 0));
        assert_eq!(input.to_pixels(0.5, 0.5), (960, 540));
        // x=1.0 must land on the last addressable pixel, not one past it.
        assert_eq!(input.to_pixels(1.0, 1.0), (1919, 1079));
    }

    #[test]
    fn out_of_range_coordinates_are_clamped() {
        let input = EnigoInput {
            screen_width: 1920,
            screen_height: 1080,
            ..EnigoInput::new()
        };
        assert_eq!(input.to_pixels(-1.0, 2.0), (0, 1079));
    }

    #[test]
    fn zero_sized_display_does_not_produce_negative_coordinates() {
        // main_display() can report 0 on a headless or mid-reconfiguration
        // display; clamping to width-1 would give -1 without the max(0).
        let input = EnigoInput {
            screen_width: 0,
            screen_height: 0,
            ..EnigoInput::new()
        };
        assert_eq!(input.to_pixels(0.5, 0.5), (0, 0));
    }

    // Deltas below are chosen to be binary-exact after division by 100
    // (12.5 → 0.125, 25 → 0.25). Accumulating 0.1 ten times in f64 lands on
    // 0.9999999999999999, which truncates to zero — a test written with 10px
    // events would fail on the arithmetic rather than on the behaviour.

    /// The bug this replaces: `(dy / 100.0).round()` is 0 for anything under
    /// 50px, and a trackpad emits a stream of small deltas. Scrolling with one
    /// produced no movement whatsoever.
    #[test]
    fn small_scroll_deltas_accumulate_into_a_notch() {
        let mut input = EnigoInput::new();
        let mut notches = 0i32;
        for _ in 0..8 {
            notches += input.take_scroll_notches(0.0, 12.5).0;
        }
        assert_eq!(notches, 1, "8 × 12.5px is exactly one notch");
    }

    #[test]
    fn a_single_small_delta_moves_nothing_yet() {
        let mut input = EnigoInput::new();
        assert_eq!(input.take_scroll_notches(0.0, 12.5), (0, 0));
    }

    #[test]
    fn a_full_wheel_click_is_one_notch_immediately() {
        let mut input = EnigoInput::new();
        assert_eq!(input.take_scroll_notches(0.0, 100.0).0, 1);
    }

    #[test]
    fn scrolling_back_and_forth_does_not_drift() {
        // Truncation has to be symmetric about zero, or shaking the wheel
        // would slowly walk the page in one direction.
        let mut input = EnigoInput::new();
        let mut net = 0i32;
        for _ in 0..50 {
            net += input.take_scroll_notches(0.0, 25.0).0;
            net += input.take_scroll_notches(0.0, -25.0).0;
        }
        assert_eq!(net, 0, "equal and opposite scrolling must net to zero");
    }

    #[test]
    fn a_large_delta_still_scrolls_proportionally() {
        // The remainder must not cap the rate: a fast flick is many notches.
        let mut input = EnigoInput::new();
        assert_eq!(input.take_scroll_notches(0.0, 500.0).0, 5);
    }

    #[test]
    fn horizontal_and_vertical_remainders_are_independent() {
        let mut input = EnigoInput::new();
        for _ in 0..3 {
            input.take_scroll_notches(25.0, 0.0);
        }
        // 75px horizontal banked; the fourth completes a notch, vertical
        // stays untouched throughout.
        assert_eq!(input.take_scroll_notches(25.0, 0.0), (0, 1));
    }
}
