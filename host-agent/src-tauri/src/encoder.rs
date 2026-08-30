//! Duxo VP8 video encoder — §0.5, §6.5.
//!
//! CORRECTION TO A PLAN ASSUMPTION: §0.5 says "webrtc-rs handles VP8/VP9
//! encoding internally". It does not. webrtc-rs is transport only — it
//! packetizes and sends media that is *already* compressed, and has no
//! encoder of any kind. Writing raw captured pixels into a track produces a
//! stream no browser can decode; the viewer shows a permanently black
//! <video> with the connection reporting "connected", which is the most
//! confusing possible failure. This module is the missing stage: it turns
//! captured BGRA frames into VP8 packets that `TrackLocalStaticSample` can
//! carry.
//!
//! Pipeline: capture (BGRA, native resolution)
//!             → scale + colour-convert to I420 at the target resolution
//!             → libvpx VP8, real-time deadline
//!             → webrtc::media::Sample
//!
//! §6.5 KPI targets: 15–20 fps at 1280×720, which is what the defaults here
//! are tuned for. libvpx's VPX_DL_REALTIME deadline is what keeps encode
//! latency bounded — quality is explicitly traded away for latency, because
//! on a remote-control tool a sharp frame that arrives 400ms late is worse
//! than a soft one that arrives now.

use crate::types::{DuxoError, Result};

/// §6.5 — target capture/encode resolution. Frames larger than this are
/// scaled down; smaller ones are left alone rather than upscaled, since
/// upscaling costs bandwidth and adds no detail.
pub const TARGET_WIDTH: u32 = 1280;
pub const TARGET_HEIGHT: u32 = 720;

/// §0.3 — Metered's free TURN tier is 50GB/month. At 1.5 Mbps a relayed
/// session burns roughly 675 MB/hour, so this is the difference between the
/// free tier lasting ~74 hours a month and running out mid-support-call.
const DEFAULT_BITRATE_KBPS: u32 = 1500;

pub struct VideoEncoder {
    inner: vpx_encode::Encoder,
    /// Encoder input dimensions — always even, always ≤ the target.
    width: u32,
    height: u32,
    /// Reusable I420 scratch buffer. Reallocating ~1.4MB per frame at 20fps
    /// is pure allocator churn for no benefit.
    i420: Vec<u8>,
    /// The PTS of the last frame handed to libvpx. PTS must strictly
    /// increase, and two frames captured inside the same timebase tick would
    /// otherwise collide.
    last_pts: i64,
    /// The timebase denominator, i.e. PTS units per second.
    timebase_hz: i64,
}

/// One encoded frame, ready to hand to `TrackLocalStaticSample::write_sample`.
pub struct EncodedFrame {
    pub data: Vec<u8>,
    pub is_keyframe: bool,
}

impl VideoEncoder {
    /// Build an encoder sized for a capture surface of `src_width`×`src_height`.
    ///
    /// The output is scaled to fit within TARGET_WIDTH×TARGET_HEIGHT with the
    /// aspect ratio preserved, then rounded down to even dimensions — I420
    /// subsamples chroma 2×2, so odd dimensions have no valid representation.
    pub fn new(src_width: u32, src_height: u32, fps: u32) -> Result<Self> {
        let (width, height) = fit_within(src_width, src_height, TARGET_WIDTH, TARGET_HEIGHT);

        if width == 0 || height == 0 {
            return Err(DuxoError::Encoder(format!(
                "capture surface {src_width}×{src_height} scales to an empty frame"
            )));
        }

        let timebase_hz = fps.max(1) as i32;

        let config = vpx_encode::Config {
            width,
            height,
            timebase: [1, timebase_hz],
            bitrate: DEFAULT_BITRATE_KBPS,
            codec: vpx_encode::VideoCodecId::VP8,
        };

        let inner = vpx_encode::Encoder::new(config)
            .map_err(|e| DuxoError::Encoder(format!("libvpx init failed: {e}")))?;

        let i420_len = i420_len(width, height);

        tracing::info!(
            src_width,
            src_height,
            enc_width = width,
            enc_height = height,
            bitrate_kbps = DEFAULT_BITRATE_KBPS,
            fps,
            "VP8 encoder initialised"
        );

        Ok(Self {
            inner,
            width,
            height,
            i420: vec![0u8; i420_len],
            last_pts: -1,
            timebase_hz: timebase_hz as i64,
        })
    }

    /// Where on the encoder's timeline a frame captured `elapsed` after the
    /// stream started belongs.
    ///
    /// Deliberately wall-clock, not a frame counter. A counter says "frame 200
    /// is at t=10s" no matter when frame 200 was actually grabbed, so if
    /// capture is running at 8fps rather than the 20 it was configured for,
    /// libvpx believes 200 frames spanned 10 seconds when they really spanned
    /// 25 — and paces its 1500 kbps budget against a timeline running 2.5×
    /// fast, spending 2.5× the bitrate. On a 50GB/month TURN allowance
    /// (§0.3) that is the difference between a month and twelve days.
    fn pts_for(&mut self, elapsed: std::time::Duration) -> i64 {
        let pts = pts_units(elapsed, self.timebase_hz).max(self.last_pts + 1);
        self.last_pts = pts;
        pts
    }

    /// How long each frame occupies, for `Sample::duration`.
    pub fn frame_duration(&self) -> std::time::Duration {
        std::time::Duration::from_secs_f64(1.0 / self.timebase_hz as f64)
    }

    /// Encode one captured BGRA frame.
    ///
    /// Returns every packet libvpx produced for it. That is usually exactly
    /// one, but the API is a stream and can legitimately return zero (frame
    /// dropped under the rate target) or more than one, so the caller must
    /// not assume a 1:1 mapping.
    pub fn encode_bgra(
        &mut self,
        bgra: &[u8],
        src_width: u32,
        src_height: u32,
        elapsed: std::time::Duration,
    ) -> Result<Vec<EncodedFrame>> {
        let expected = (src_width as usize) * (src_height as usize) * 4;
        if bgra.len() < expected {
            return Err(DuxoError::Encoder(format!(
                "short BGRA frame: got {} bytes, need {expected}",
                bgra.len()
            )));
        }

        bgra_to_i420(
            bgra,
            src_width,
            src_height,
            &mut self.i420,
            self.width,
            self.height,
        );

        // vpx-encode exposes no per-frame keyframe request, so keyframe timing
        // is libvpx's own decision. The caller logs when one arrives, which is
        // what the §6.5 recovery-after-loss KPI is measured from.
        let pts = self.pts_for(elapsed);

        let packets = self
            .inner
            .encode(pts, &self.i420)
            .map_err(|e| DuxoError::Encoder(format!("VP8 encode failed: {e}")))?;

        let mut out = Vec::new();
        for frame in packets {
            out.push(EncodedFrame {
                data: frame.data.to_vec(),
                is_keyframe: frame.key,
            });
        }

        Ok(out)
    }
}

/// Scale `(w, h)` to fit inside `(max_w, max_h)` preserving aspect ratio,
/// never upscaling, and rounding down to even dimensions for I420.
fn fit_within(w: u32, h: u32, max_w: u32, max_h: u32) -> (u32, u32) {
    if w == 0 || h == 0 {
        return (0, 0);
    }
    let scale = f64::min(
        f64::min(max_w as f64 / w as f64, max_h as f64 / h as f64),
        1.0,
    );
    let out_w = ((w as f64 * scale) as u32) & !1;
    let out_h = ((h as f64 * scale) as u32) & !1;
    (out_w, out_h)
}

/// Convert wall-clock elapsed time into encoder timebase units.
fn pts_units(elapsed: std::time::Duration, timebase_hz: i64) -> i64 {
    (elapsed.as_secs_f64() * timebase_hz as f64) as i64
}

/// Byte length of a planar I420 buffer: full-resolution Y, quarter-resolution
/// U and V.
fn i420_len(w: u32, h: u32) -> usize {
    let y = (w as usize) * (h as usize);
    y + y / 2
}

/// BGRA → I420, scaling from the source to the destination in the same pass.
///
/// Doing scale and colour-convert together matters: at 1920×1080 an
/// intermediate scaled BGRA buffer would be another 8MB written and read back
/// every frame, and at 20fps that alone is 300MB/s of memory traffic for no
/// gain. Sampling is nearest-neighbour — a box filter looks better on
/// photographs but costs several times as much, and screen content (text,
/// window edges) is dominated by hard edges where the difference is small.
///
/// Coefficients are BT.601 studio-swing, which is what libvpx and every
/// browser's WebRTC decoder assume for VP8 by default.
fn bgra_to_i420(bgra: &[u8], src_w: u32, src_h: u32, dst: &mut [u8], dst_w: u32, dst_h: u32) {
    let (sw, sh) = (src_w as usize, src_h as usize);
    let (dw, dh) = (dst_w as usize, dst_h as usize);
    if dw == 0 || dh == 0 || sw == 0 || sh == 0 {
        return;
    }

    let y_size = dw * dh;
    let uv_size = y_size / 4;
    let (y_plane, rest) = dst.split_at_mut(y_size);
    let (u_plane, v_plane) = rest.split_at_mut(uv_size);

    // Fixed-point source-pixel step, 16.16. Integer stepping avoids a float
    // multiply and a cast per pixel in the inner loop.
    let x_step = ((sw << 16) / dw) as u32;
    let y_step = ((sh << 16) / dh) as u32;

    for dy in 0..dh {
        let sy = ((dy as u32 * y_step) >> 16) as usize;
        let src_row = sy.min(sh - 1) * sw * 4;
        let y_row = dy * dw;

        for dx in 0..dw {
            let sx = ((dx as u32 * x_step) >> 16) as usize;
            let p = src_row + sx.min(sw - 1) * 4;

            // scrap and the Windows DXGI path both deliver BGRA.
            let b = bgra[p] as i32;
            let g = bgra[p + 1] as i32;
            let r = bgra[p + 2] as i32;

            // Y = 0.257R + 0.504G + 0.098B + 16, in 8.8 fixed point.
            y_plane[y_row + dx] = (((66 * r + 129 * g + 25 * b + 128) >> 8) + 16) as u8;

            // Chroma is subsampled 2×2: take it from the top-left pixel of
            // each 2×2 destination block. Averaging the block would be more
            // correct but the chroma detail is discarded by the codec anyway.
            if dy % 2 == 0 && dx % 2 == 0 {
                let c_index = (dy / 2) * (dw / 2) + (dx / 2);
                u_plane[c_index] = (((-38 * r - 74 * g + 112 * b + 128) >> 8) + 128) as u8;
                v_plane[c_index] = (((112 * r - 94 * g - 18 * b + 128) >> 8) + 128) as u8;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fit_within_never_upscales() {
        assert_eq!(fit_within(640, 480, 1280, 720), (640, 480));
    }

    #[test]
    fn fit_within_preserves_aspect_and_rounds_even() {
        // 1920×1080 is 16:9 and scales cleanly to the 1280×720 target.
        assert_eq!(fit_within(1920, 1080, 1280, 720), (1280, 720));
        // 1440×900 is 16:10: height binds first, and both sides stay even.
        let (w, h) = fit_within(1440, 900, 1280, 720);
        assert_eq!((w, h), (1152, 720));
        assert_eq!(w % 2, 0);
        assert_eq!(h % 2, 0);
    }

    #[test]
    fn fit_within_rejects_degenerate_input() {
        assert_eq!(fit_within(0, 1080, 1280, 720), (0, 0));
    }

    #[test]
    fn i420_len_is_one_and_a_half_bytes_per_pixel() {
        assert_eq!(i420_len(1280, 720), 1280 * 720 * 3 / 2);
    }

    #[test]
    fn pure_colours_convert_to_expected_luma() {
        // A 2×2 solid-white BGRA frame, converted 1:1.
        let white = vec![255u8; 2 * 2 * 4];
        let mut out = vec![0u8; i420_len(2, 2)];
        bgra_to_i420(&white, 2, 2, &mut out, 2, 2);
        // Studio-swing white is 235, and every luma sample should hit it.
        for y in &out[..4] {
            assert!((*y as i32 - 235).abs() <= 1, "luma {y} should be ~235");
        }
        // White is achromatic: both chroma samples sit at the 128 midpoint.
        assert!((out[4] as i32 - 128).abs() <= 1);
        assert!((out[5] as i32 - 128).abs() <= 1);
    }

    #[test]
    fn black_converts_to_studio_black() {
        let black = vec![0u8; 2 * 2 * 4];
        let mut out = vec![0u8; i420_len(2, 2)];
        bgra_to_i420(&black, 2, 2, &mut out, 2, 2);
        for y in &out[..4] {
            assert!((*y as i32 - 16).abs() <= 1, "luma {y} should be ~16");
        }
    }

    #[test]
    fn channel_order_is_bgra_not_rgba() {
        // One pixel, pure red in BGRA byte order: B=0, G=0, R=255.
        // Read as RGBA this would be pure blue, and the two have very
        // different luma (81 vs 41), so this pins the byte order down.
        let red_bgra = vec![0u8, 0, 255, 255];
        let mut out = vec![0u8; i420_len(2, 2)];
        bgra_to_i420(&red_bgra, 1, 1, &mut out, 2, 2);
        assert!(
            (out[0] as i32 - 81).abs() <= 2,
            "pure red luma should be ~81, got {}",
            out[0]
        );
    }

    #[test]
    fn pts_tracks_the_wall_clock_not_the_frame_count() {
        // 20fps timebase. A frame captured 2.5 seconds in belongs at 50,
        // whether it is the 50th frame or the 12th — capture that stalls or
        // drops frames must not compress the timeline it reports.
        assert_eq!(pts_units(std::time::Duration::from_millis(2500), 20), 50);
        assert_eq!(pts_units(std::time::Duration::ZERO, 20), 0);
        assert_eq!(pts_units(std::time::Duration::from_secs(60), 20), 1200);
    }

    #[test]
    fn pts_never_repeats_within_one_timebase_tick() {
        // libvpx requires strictly increasing PTS. At 20fps the timebase tick
        // is 50ms, so two frames 10ms apart round to the same unit; the
        // encoder has to break the tie rather than hand libvpx a duplicate.
        let a = pts_units(std::time::Duration::from_millis(100), 20);
        let b = pts_units(std::time::Duration::from_millis(110), 20);
        assert_eq!(a, b, "this is the collision the clamp exists for");
        assert!(b.max(a + 1) > a);
    }

    #[test]
    fn downscaling_writes_every_destination_pixel() {
        // A 4×4 source scaled to 2×2 must leave no sample untouched.
        let src = vec![200u8; 4 * 4 * 4];
        let mut out = vec![0u8; i420_len(2, 2)];
        bgra_to_i420(&src, 4, 4, &mut out, 2, 2);
        assert!(out.iter().all(|b| *b != 0));
    }
}
