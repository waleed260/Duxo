use crate::backend::{CaptureBackend, CapturedFrame};
use crate::types::{DuxoError, Result};

pub struct WindowsCapture {
    running: bool,
    capturer: Option<scrap::Capturer>,
    width: u32,
    height: u32,
}

impl WindowsCapture {
    pub fn new() -> Self {
        Self {
            running: false,
            capturer: None,
            width: 0,
            height: 0,
        }
    }
}

impl CaptureBackend for WindowsCapture {
    fn start(&mut self) -> Result<()> {
        let display = scrap::Display::primary()
            .map_err(|e| DuxoError::Firebase(format!("Failed to open DXGI display: {e}")))?;

        let width = display.width() as u32;
        let height = display.height() as u32;

        let capturer = scrap::Capturer::new(display)
            .map_err(|e| DuxoError::Firebase(format!("Failed to create DXGI capturer: {e}")))?;

        self.capturer = Some(capturer);
        self.width = width;
        self.height = height;
        self.running = true;

        tracing::info!(
            width = width,
            height = height,
            "Windows DXGI capture started"
        );
        Ok(())
    }

    fn next_frame(&mut self) -> Result<CapturedFrame> {
        if !self.running || self.capturer.is_none() {
            return Err(DuxoError::CaptureBackendUnavailable);
        }

        let capturer = self.capturer.as_mut().unwrap();
        let frame = capturer.frame()
            .map_err(|e| DuxoError::Firebase(format!("DXGI frame capture failed: {e}")))?;

        let stride = capturer.stride();
        let bytes_per_pixel = 4;
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
        tracing::info!("Windows DXGI capture stopped");
        Ok(())
    }
}
