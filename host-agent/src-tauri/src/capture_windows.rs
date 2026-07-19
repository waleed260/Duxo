//! Duxo Windows screen capture — §0.5.
//!
//! DXGI Desktop Duplication API — the single capture path on Windows.
//! Produces frames suitable for encoding as VP8/VP9 via webrtc-rs.

use crate::backend::{CaptureBackend, CapturedFrame};
use crate::types::{DuxoError, Result};

#[cfg(target_os = "windows")]
pub struct WindowsCapture {
    running: bool,
}

#[cfg(target_os = "windows")]
impl WindowsCapture {
    pub fn new() -> Self {
        Self { running: false }
    }
}

#[cfg(target_os = "windows")]
impl CaptureBackend for WindowsCapture {
    fn start(&mut self) -> Result<()> {
        self.running = true;
        tracing::info!("Windows DXGI capture started");
        Ok(())
    }

    fn next_frame(&mut self) -> Result<CapturedFrame> {
        if !self.running {
            return Err(DuxoError::CaptureBackendUnavailable);
        }
        // TODO: Phase 3 — DXGI Desktop Duplication frame acquisition.
        Err(DuxoError::CaptureBackendUnavailable)
    }

    fn stop(&mut self) -> Result<()> {
        self.running = false;
        tracing::info!("Windows DXGI capture stopped");
        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
pub struct WindowsCapture;

#[cfg(not(target_os = "windows"))]
impl WindowsCapture {
    pub fn new() -> Self { Self }
}

#[cfg(not(target_os = "windows"))]
impl CaptureBackend for WindowsCapture {
    fn start(&mut self) -> Result<()> { Err(DuxoError::CaptureBackendUnavailable) }
    fn next_frame(&mut self) -> Result<CapturedFrame> { Err(DuxoError::CaptureBackendUnavailable) }
    fn stop(&mut self) -> Result<()> { Ok(()) }
}
