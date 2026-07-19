//! Duxo Linux X11 screen capture — §0.5.
//!
//! XShm / XGetImage — direct, no permission dialog (§0.2).
//! §0.2 — full control on X11. Wayland = view-only until Phase 5.
//!
//! Uses the `scrap` crate for cross-platform screen capture on X11.
//! Produces BGRA frames suitable for VP8 encoding via webrtc-rs.

use crate::backend::{CaptureBackend, CapturedFrame};
use crate::types::{DuxoError, Result};

pub struct X11Capture {
    running: bool,
    /// scrap::Capturer — owns the X11 display connection and shared memory segment.
    capturer: Option<scrap::Capturer>,
    /// Display width in pixels (cached on start).
    width: u32,
    /// Display height in pixels (cached on start).
    height: u32,
}

impl X11Capture {
    pub fn new() -> Self {
        Self {
            running: false,
            capturer: None,
            width: 0,
            height: 0,
        }
    }
}

impl CaptureBackend for X11Capture {
    fn start(&mut self) -> Result<()> {
        // §0.5 — scrap uses XShm for zero-copy capture on X11.
        // No permission dialog needed — X11 has no per-app permission model.
        let display = scrap::Display::primary()
            .map_err(|e| DuxoError::Firebase(format!("Failed to open X11 display: {e}")))?;

        let width = display.width() as u32;
        let height = display.height() as u32;

        let capturer = scrap::Capturer::new(display)
            .map_err(|e| DuxoError::Firebase(format!("Failed to create X11 capturer: {e}")))?;

        self.capturer = Some(capturer);
        self.width = width;
        self.height = height;
        self.running = true;

        tracing::info!(
            width = width,
            height = height,
            "Linux X11 capture started"
        );
        Ok(())
    }

    fn next_frame(&mut self) -> Result<CapturedFrame> {
        if !self.running || self.capturer.is_none() {
            return Err(DuxoError::CaptureBackendUnavailable);
        }

        let capturer = self.capturer.as_mut().unwrap();

        // §0.5 — scrap::Capturer::frame() returns BGRA pixel data.
        // Blocks until a new frame is available (vsync-aligned).
        let frame = capturer.frame()
            .map_err(|e| DuxoError::Firebase(format!("X11 frame capture failed: {e}")))?;

        let stride = capturer.stride();
        let bytes_per_pixel = 4; // BGRA

        // Convert from stride-padded buffer to tightly-packed BGRA.
        let expected_len = (self.width * self.height * bytes_per_pixel) as usize;
        let mut data = Vec::with_capacity(expected_len);

        for y in 0..self.height {
            let row_start = (y as usize) * stride;
            let row_end = row_start + (self.width as usize) * bytes_per_pixel;
            if row_end <= frame.len() {
                data.extend_from_slice(&frame[row_start..row_end]);
            }
        }

        Ok(CapturedFrame {
            width: self.width,
            height: self.height,
            data,
            timestamp_ns: chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0),
        })
    }

    fn stop(&mut self) -> Result<()> {
        self.running = false;
        self.capturer = None;
        tracing::info!("Linux X11 capture stopped");
        Ok(())
    }
}

/// §0.5 — Wayland capture stub (view-only, Phase 5 for input).
///
/// On Wayland, screen capture goes through xdg-desktop-portal + PipeWire.
/// The user must approve each session via the portal's RemoteDesktop interface.
/// This is NOT in the MVP — only screen viewing, no input injection.
pub struct WaylandCapture {
    running: bool,
}

impl WaylandCapture {
    pub fn new() -> Self {
        Self { running: false }
    }
}

impl CaptureBackend for WaylandCapture {
    fn start(&mut self) -> Result<()> {
        // §0.2 — Wayland capture requires xdg-desktop-portal + PipeWire.
        // MVP: view-only. Full control deferred to Phase 5.
        tracing::warn!("Wayland capture not yet implemented — view-only mode (Phase 5)");
        self.running = true;
        Ok(())
    }

    fn next_frame(&mut self) -> Result<CapturedFrame> {
        // Phase 5 — xdg-desktop-portal D-Bus call → PipeWire fd → frame decoding.
        Err(DuxoError::CaptureBackendUnavailable)
    }

    fn stop(&mut self) -> Result<()> {
        self.running = false;
        Ok(())
    }
}
