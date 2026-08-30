//! Duxo screen capture — §0.5, §6.5.
//!
//! REPLACES `capture_linux_x11.rs` and `capture_windows.rs`. Two things forced
//! the rewrite, and both are structural rather than cosmetic:
//!
//! 1. **`scrap::Capturer` is neither `Send` nor `Sync`** — it holds an `Rc` and
//!    raw pointers into the display server's shared memory. The old
//!    `CaptureBackend: Send + Sync` bound was therefore unsatisfiable, and the
//!    capture loop could not live in a tokio task at all.
//! 2. **Neither backend has `stride()`.** Both callers used it to un-pad rows;
//!    on scrap 0.5 a `Frame` derefs straight to a tightly packed `&[u8]`, so
//!    the un-padding loop was reading a method that does not exist.
//!
//! So capture owns a dedicated OS thread, and the encoder rides along with it.
//! That is the right place for it regardless of the `Send` problem: grabbing a
//! frame blocks on the compositor and encoding 720p through libvpx costs
//! 10–20ms of solid CPU. Both on the async executor would stall every other
//! task in the process — including the RTDB polling that keeps the session
//! alive — for a fifth of a second at a time.
//!
//! The thread sends *encoded* VP8 frames out over a bounded channel. Bounded
//! matters: if the network cannot keep up, the right behaviour is to drop
//! frames and stay current, not to queue an ever-growing backlog of stale
//! screen state.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::encoder::VideoEncoder;
use crate::types::{DuxoError, Result};

/// §6.5 — capture cadence. 20fps is the top of the 15–20fps target band.
pub const TARGET_FPS: u32 = 20;

/// Queue depth for encoded frames. Two is enough to absorb a scheduling
/// hiccup; more would just mean showing the viewer older screen content.
const FRAME_QUEUE_DEPTH: usize = 2;

/// One encoded frame on its way to the WebRTC track.
pub struct CapturedVideo {
    pub data: Vec<u8>,
    pub duration: Duration,
    pub is_keyframe: bool,
}

/// A running capture thread. Dropping this stops the thread.
pub struct CaptureSession {
    pub frames: tokio::sync::mpsc::Receiver<CapturedVideo>,
    stop: Arc<AtomicBool>,
    join: Option<std::thread::JoinHandle<()>>,
}

impl CaptureSession {
    /// Signal the thread to stop and wait for it to release the display.
    pub fn stop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(join) = self.join.take() {
            let _ = join.join();
        }
    }
}

impl Drop for CaptureSession {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Start capturing the primary display, encoding to VP8 on a dedicated thread.
///
/// Returns as soon as the thread is running; the first frame arrives on the
/// channel. Errors here are setup errors — no display, no encoder — and mean
/// the session cannot show anything, so the caller should surface them rather
/// than continue with a blank screen.
pub fn start() -> Result<CaptureSession> {
    // §0.2 — Wayland capture is xdg-desktop-portal + PipeWire, Phase 5. With
    // XWayland present (DISPLAY set) scrap still works, so only a pure
    // Wayland session is genuinely unsupported.
    #[cfg(target_os = "linux")]
    if std::env::var("WAYLAND_DISPLAY").is_ok() && std::env::var("DISPLAY").is_err() {
        return Err(DuxoError::Capture(
            "this is a Wayland session with no XWayland display. Duxo can only \
             capture X11 sessions for now — log out and choose an \"Xorg\" or \
             \"X11\" session at the login screen"
                .to_string(),
        ));
    }

    let (tx, rx) = tokio::sync::mpsc::channel::<CapturedVideo>(FRAME_QUEUE_DEPTH);
    let stop = Arc::new(AtomicBool::new(false));
    let stop_for_thread = Arc::clone(&stop);

    // A `std::thread`, not a tokio blocking task: the Capturer must be created
    // and dropped on the same thread it is used from, and a blocking-pool
    // thread can be reused for something else the moment we yield.
    let (ready_tx, ready_rx) = std::sync::mpsc::channel::<Result<()>>();

    let join = std::thread::Builder::new()
        .name("duxo-capture".to_string())
        .spawn(move || capture_loop(tx, stop_for_thread, ready_tx))
        .map_err(|e| DuxoError::Capture(format!("could not spawn capture thread: {e}")))?;

    // Surface setup failures as errors from `start()` rather than as a session
    // that connects and then shows nothing.
    match ready_rx.recv() {
        Ok(Ok(())) => {}
        Ok(Err(e)) => {
            let _ = join.join();
            return Err(e);
        }
        Err(_) => {
            let _ = join.join();
            return Err(DuxoError::Capture(
                "capture thread exited before reporting readiness".to_string(),
            ));
        }
    }

    Ok(CaptureSession {
        frames: rx,
        stop,
        join: Some(join),
    })
}

fn capture_loop(
    tx: tokio::sync::mpsc::Sender<CapturedVideo>,
    stop: Arc<AtomicBool>,
    ready: std::sync::mpsc::Sender<Result<()>>,
) {
    let mut capturer = match open_capturer() {
        Ok(c) => c,
        Err(e) => {
            let _ = ready.send(Err(e));
            return;
        }
    };

    let width = capturer.width() as u32;
    let height = capturer.height() as u32;

    let mut encoder = match VideoEncoder::new(width, height, TARGET_FPS) {
        Ok(e) => e,
        Err(e) => {
            let _ = ready.send(Err(e));
            return;
        }
    };

    let _ = ready.send(Ok(()));

    let frame_interval = Duration::from_millis(1000 / TARGET_FPS as u64);
    let frame_duration = encoder.frame_duration();
    let mut frames: u64 = 0;
    let mut dropped: u64 = 0;
    let mut window = Instant::now();

    tracing::info!(width, height, fps = TARGET_FPS, "capture thread started");

    while !stop.load(Ordering::SeqCst) {
        let tick = Instant::now();

        let raw = match capturer.frame() {
            Ok(frame) => frame,
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                // Nothing composited since the last grab. Come back promptly
                // rather than idling a whole frame slot — sleeping the full
                // interval here halves the effective rate on any screen that
                // is not constantly repainting.
                std::thread::sleep(Duration::from_millis(4));
                continue;
            }
            Err(e) => {
                tracing::warn!(error = %e, "frame capture failed");
                std::thread::sleep(frame_interval);
                continue;
            }
        };

        // scrap 0.5 hands back a tightly packed BGRA buffer on both X11 and
        // DXGI — there is no stride to un-pad.
        let packets = match encoder.encode_bgra(&raw, width, height) {
            Ok(p) => p,
            Err(e) => {
                tracing::warn!(error = %e, "encode failed");
                continue;
            }
        };
        for packet in packets {
            let video = CapturedVideo {
                data: packet.data,
                duration: frame_duration,
                is_keyframe: packet.is_keyframe,
            };

            match tx.try_send(video) {
                Ok(()) => frames += 1,
                Err(tokio::sync::mpsc::error::TrySendError::Full(_)) => {
                    // The consumer is behind. Dropping the newest frame keeps
                    // the queue holding the *most recent* screen state; the
                    // alternative is showing the viewer a growing lag.
                    dropped += 1;
                }
                Err(tokio::sync::mpsc::error::TrySendError::Closed(_)) => {
                    tracing::info!("frame consumer went away — stopping capture");
                    return;
                }
            }
        }

        if frames > 0 && frames.is_multiple_of(100) {
            // §6.5 KPI — measured, not asserted.
            let fps = 100.0 / window.elapsed().as_secs_f64().max(0.001);
            tracing::info!(
                kpi = "capture_fps",
                frames,
                dropped,
                fps = format!("{fps:.1}"),
                "capture running"
            );
            window = Instant::now();
        }

        let elapsed = tick.elapsed();
        if elapsed < frame_interval {
            std::thread::sleep(frame_interval - elapsed);
        }
    }

    tracing::info!(total_frames = frames, dropped, "capture thread stopped");
}

fn open_capturer() -> Result<scrap::Capturer> {
    let display = scrap::Display::primary()
        .map_err(|e| DuxoError::Capture(format!("could not open the primary display: {e}")))?;
    scrap::Capturer::new(display)
        .map_err(|e| DuxoError::Capture(format!("could not start screen capture: {e}")))
}
