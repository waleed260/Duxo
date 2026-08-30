//! Duxo WebRTC host peer — §1.3 lifecycle, §1.4 data channel, §10.3b dispatch.
//!
//! ROLE CORRECTION. The previous version of this module had the host create
//! the SDP offer. §1.6-B has the viewer offering and the host answering, and
//! the browser side implements exactly that — so both peers were offering and
//! neither could ever answer. The host is the **answerer** here.
//!
//! That choice is also the right one on the merits: the browser is the peer
//! that knows what it can decode, so letting it write the offer means codec
//! negotiation is driven by the side with the real constraints.
//!
//! §1.2 — this module owns the peer connection, the video track, and input
//! injection. It owns no permission decisions: `input_allowed` is set by the
//! session state machine and re-checked on every single input message, so a
//! viewer that keeps sending after a session ends injects nothing.
//!
//! §10.3c — 100 messages/s/type; excess is dropped silently.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use base64::Engine as _;
use tokio::sync::mpsc;
use webrtc::api::interceptor_registry::register_default_interceptors;
use webrtc::api::media_engine::MediaEngine;
use webrtc::api::APIBuilder;
use webrtc::data_channel::RTCDataChannel;
use webrtc::ice_transport::ice_candidate::RTCIceCandidateInit;
use webrtc::ice_transport::ice_connection_state::RTCIceConnectionState;
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::media::Sample;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::peer_connection_state::RTCPeerConnectionState;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;
use webrtc::peer_connection::RTCPeerConnection;
use webrtc::rtp_transceiver::rtp_codec::RTCRtpCodecCapability;
use webrtc::track::track_local::track_local_static_sample::TrackLocalStaticSample;
use webrtc::track::track_local::TrackLocal;

use crate::backend::{InputBackend, InputButton, InputState};
use crate::types::{DuxoError, Result};

/// §10.3c — rate limiting: maximum 100 msgs/s per message type.
const RATE_LIMIT_WINDOW: std::time::Duration = std::time::Duration::from_secs(1);
const RATE_LIMIT_MAX_PER_WINDOW: u32 = 100;

/// §1.4 — 10MB cap. The viewer enforces this before starting a transfer; the
/// host enforces it again because a viewer is not a trust boundary (§1.2).
const MAX_FILE_BYTES: usize = 10 * 1024 * 1024;
/// A transfer that stalls this long is abandoned and its partial data dropped
/// (§6.2 — "mid-transfer data channel drop → discard, restart from scratch").
const FILE_ASSEMBLY_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);

/// How many transfers may be in flight at once, and how much they may hold
/// between them.
///
/// The 10MB cap is per `fileId`, and `fileId` is chosen by the peer. Nothing
/// stopped it opening new ones indefinitely and keeping each alive with one
/// chunk inside the timeout window, so "10MB per file" bounded nothing in
/// aggregate. The host has been approved to share a screen (§2.4), which is
/// not the same as being approved to fill its memory.
const MAX_CONCURRENT_TRANSFERS: usize = 8;
const MAX_TOTAL_ASSEMBLY_BYTES: usize = 32 * 1024 * 1024;

/// Events the peer raises for the signaling loop to publish to RTDB (§1.6-B).
#[derive(Debug)]
pub enum HostSignal {
    /// §0.6 — a locally gathered ICE candidate, already JSON-encoded.
    Candidate(String),
    /// §1.1 — drives WAITING→…→ACTIVE→ENDED from the host's own observation,
    /// never from anything the viewer asserts.
    ConnectionState(RTCPeerConnectionState),
}

/// ICE server configuration — STUN first, TURN as fallback (§0.5).
pub struct IceConfig {
    pub stun_urls: Vec<String>,
    pub turn_urls: Vec<String>,
    pub turn_username: Option<String>,
    pub turn_credential: Option<String>,
}

impl Default for IceConfig {
    fn default() -> Self {
        Self {
            stun_urls: vec!["stun:stun.l.google.com:19302".to_string()],
            turn_urls: std::env::var("DUXO_METERED_TURN_URLS")
                .unwrap_or_default()
                .split(',')
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(String::from)
                .collect(),
            turn_username: std::env::var("DUXO_METERED_TURN_USERNAME").ok(),
            turn_credential: std::env::var("DUXO_METERED_TURN_CREDENTIAL").ok(),
        }
    }
}

impl IceConfig {
    fn to_servers(&self) -> Vec<RTCIceServer> {
        let mut servers = vec![RTCIceServer {
            urls: self.stun_urls.clone(),
            ..Default::default()
        }];

        // §0.8 — TURN is the fallback for the ~10-15% of networks that STUN
        // cannot traverse. Without credentials the entry is worse than
        // useless: ICE spends its whole timeout retrying a server that will
        // reject every allocation.
        match (&self.turn_username, &self.turn_credential) {
            (Some(user), Some(cred)) if !self.turn_urls.is_empty() => {
                servers.push(RTCIceServer {
                    urls: self.turn_urls.clone(),
                    username: user.clone(),
                    credential: cred.clone(),
                    ..Default::default()
                });
            }
            _ if !self.turn_urls.is_empty() => {
                tracing::warn!(
                    "TURN URLs configured without credentials — relay fallback disabled"
                );
            }
            _ => {
                tracing::warn!(
                    "no TURN configured — sessions on restrictive networks (§0.8) will fail"
                );
            }
        }

        servers
    }
}

/// An in-progress chunked file transfer (§1.4 D).
struct FileAssembly {
    file_name: String,
    total: u64,
    received: HashMap<u64, Vec<u8>>,
    bytes: usize,
    last_chunk_at: Instant,
}

/// Shared state the data-channel callbacks need. Kept in one struct so the
/// closures capture a single Arc rather than five.
struct ChannelContext {
    /// §0.2 — `None` on a platform that cannot inject input (Wayland). The
    /// session still runs; it is view-only, and every input message is
    /// dropped with one log line rather than failing the connection.
    input: Mutex<Option<Box<dyn InputBackend>>>,
    /// §1.2/§2.4 — the gate. False until the host's own state machine says
    /// ACTIVE; re-read per message, so revoking it takes effect immediately.
    input_allowed: Arc<AtomicBool>,
    rate: Mutex<HashMap<String, (Instant, u32)>>,
    files: Mutex<HashMap<String, FileAssembly>>,
    /// Where completed file transfers land.
    download_dir: std::path::PathBuf,
}

pub struct HostPeer {
    pc: Arc<RTCPeerConnection>,
    video_track: Arc<TrackLocalStaticSample>,
    input_allowed: Arc<AtomicBool>,
    /// §6.5 — measures time to `connected` for the connection-establishment KPI.
    started_at: Instant,
}

impl HostPeer {
    /// Build the peer, register the VP8 track, and wire every callback.
    ///
    /// `signals` receives ICE candidates and connection-state changes for the
    /// signaling loop to act on; nothing here touches RTDB directly.
    pub async fn new(
        ice: &IceConfig,
        input: Option<Box<dyn InputBackend>>,
        signals: mpsc::UnboundedSender<HostSignal>,
    ) -> Result<Self> {
        let mut media_engine = MediaEngine::default();
        media_engine
            .register_default_codecs()
            .map_err(|e| DuxoError::WebRtc(format!("codec registration failed: {e}")))?;

        let mut registry = webrtc::interceptor::registry::Registry::new();
        registry = register_default_interceptors(registry, &mut media_engine)
            .map_err(|e| DuxoError::WebRtc(format!("interceptor registration failed: {e}")))?;

        let api = APIBuilder::new()
            .with_media_engine(media_engine)
            .with_interceptor_registry(registry)
            .build();

        let config = RTCConfiguration {
            ice_servers: ice.to_servers(),
            ..Default::default()
        };

        let pc = Arc::new(
            api.new_peer_connection(config)
                .await
                .map_err(|e| DuxoError::WebRtc(format!("peer connection failed: {e}")))?,
        );

        // §0.5 — the screen, as VP8. `TrackLocalStaticSample` takes encoded
        // frames and handles RTP packetization; the encoding itself is ours
        // (encoder.rs), because webrtc-rs does none.
        let video_track = Arc::new(TrackLocalStaticSample::new(
            RTCRtpCodecCapability {
                mime_type: "video/VP8".to_owned(),
                ..Default::default()
            },
            "duxo-video".to_owned(),
            "duxo-stream".to_owned(),
        ));

        let sender = pc
            .add_track(Arc::clone(&video_track) as Arc<dyn TrackLocal + Send + Sync>)
            .await
            .map_err(|e| DuxoError::WebRtc(format!("add_track failed: {e}")))?;

        // RTCP must be drained or the sender's receive buffer fills and stalls;
        // it also carries the receiver reports we would need for adaptive
        // bitrate later.
        tokio::spawn(async move {
            let mut buf = vec![0u8; 1500];
            while sender.read(&mut buf).await.is_ok() {}
        });

        let input_allowed = Arc::new(AtomicBool::new(false));

        let ctx = Arc::new(ChannelContext {
            input: Mutex::new(input),
            input_allowed: Arc::clone(&input_allowed),
            rate: Mutex::new(HashMap::new()),
            files: Mutex::new(HashMap::new()),
            download_dir: default_download_dir(),
        });

        // §1.4 — the viewer creates the single "duxo" channel; we receive it.
        let ctx_for_dc = Arc::clone(&ctx);
        pc.on_data_channel(Box::new(move |dc: Arc<RTCDataChannel>| {
            let ctx = Arc::clone(&ctx_for_dc);
            Box::pin(async move {
                let label = dc.label().to_owned();
                tracing::info!(label = %label, "data channel offered by viewer");

                let dc_for_msg = Arc::clone(&dc);
                dc.on_message(Box::new(move |msg| {
                    let ctx = Arc::clone(&ctx);
                    let dc = Arc::clone(&dc_for_msg);
                    Box::pin(async move {
                        handle_message(&ctx, &dc, &msg.data).await;
                    })
                }));

                dc.on_close(Box::new(move || {
                    tracing::info!("data channel closed");
                    Box::pin(async {})
                }));
            })
        }));

        // §0.6 — trickle our candidates out to the signaling loop.
        let sig_ice = signals.clone();
        pc.on_ice_candidate(Box::new(move |candidate| {
            let sig = sig_ice.clone();
            Box::pin(async move {
                // A `None` candidate marks end-of-gathering, not a candidate.
                let Some(candidate) = candidate else { return };
                match candidate.to_json() {
                    Ok(init) => match serde_json::to_string(&init) {
                        Ok(json) => {
                            let _ = sig.send(HostSignal::Candidate(json));
                        }
                        Err(e) => tracing::warn!(error = %e, "candidate serialize failed"),
                    },
                    Err(e) => tracing::warn!(error = %e, "candidate to_json failed"),
                }
            })
        }));

        let sig_state = signals.clone();
        let allowed_for_state = Arc::clone(&input_allowed);
        pc.on_peer_connection_state_change(Box::new(move |state: RTCPeerConnectionState| {
            let sig = sig_state.clone();
            let allowed = Arc::clone(&allowed_for_state);
            Box::pin(async move {
                tracing::info!(state = ?state, "peer connection state changed");
                // Revoke input the instant the transport is not healthy. A
                // half-open channel must not be able to keep driving the mouse.
                if !matches!(state, RTCPeerConnectionState::Connected) {
                    allowed.store(false, Ordering::SeqCst);
                }
                let _ = sig.send(HostSignal::ConnectionState(state));
            })
        }));

        pc.on_ice_connection_state_change(Box::new(move |state: RTCIceConnectionState| {
            Box::pin(async move {
                // §1.3 #3 — `disconnected` self-recovers in 10–20s; do not tear
                // anything down here. Only `failed` is actionable, and the
                // viewer drives the ICE restart (§1.3 #4).
                tracing::info!(state = ?state, "ICE connection state changed");
            })
        }));

        Ok(Self {
            pc,
            video_track,
            input_allowed,
            started_at: Instant::now(),
        })
    }

    /// §1.6-B — apply the viewer's offer and produce the answer to publish.
    ///
    /// Also used for §1.3 #4 ICE restarts: the viewer republishes an offer
    /// under the same session id and this renegotiates in place.
    pub async fn accept_offer(&self, offer_json: &str) -> Result<String> {
        let offer: RTCSessionDescription = serde_json::from_str(offer_json)?;

        self.pc
            .set_remote_description(offer)
            .await
            .map_err(|e| DuxoError::WebRtc(format!("set_remote_description failed: {e}")))?;

        let answer = self
            .pc
            .create_answer(None)
            .await
            .map_err(|e| DuxoError::WebRtc(format!("create_answer failed: {e}")))?;

        self.pc
            .set_local_description(answer.clone())
            .await
            .map_err(|e| DuxoError::WebRtc(format!("set_local_description failed: {e}")))?;

        tracing::info!("SDP answer created");
        Ok(serde_json::to_string(&answer)?)
    }

    /// §0.6 — apply candidates the viewer published.
    pub async fn add_ice_candidate(&self, candidate_json: &str) -> Result<()> {
        let init: RTCIceCandidateInit = serde_json::from_str(candidate_json)?;
        self.pc
            .add_ice_candidate(init)
            .await
            .map_err(|e| DuxoError::WebRtc(format!("add_ice_candidate failed: {e}")))?;
        Ok(())
    }

    /// §2.4 — open or close the input gate. Called only by the session state
    /// machine, only after the host has confirmed ACTIVE from its own read.
    pub fn set_input_allowed(&self, allowed: bool) {
        self.input_allowed.store(allowed, Ordering::SeqCst);
        tracing::info!(allowed, "input injection gate changed");
    }

    /// Push one encoded VP8 frame to the viewer.
    pub async fn write_frame(&self, data: Vec<u8>, duration: std::time::Duration) -> Result<()> {
        self.video_track
            .write_sample(&Sample {
                data: data.into(),
                duration,
                ..Default::default()
            })
            .await
            .map_err(|e| DuxoError::WebRtc(format!("write_sample failed: {e}")))
    }

    /// §6.5 — time since the peer was created, for the establishment KPI.
    pub fn elapsed_since_start(&self) -> std::time::Duration {
        self.started_at.elapsed()
    }

    /// §1.1 — the host's own view of the transport, which is what ACTIVE is
    /// derived from. Never the viewer's assertion.
    pub fn connection_state(&self) -> RTCPeerConnectionState {
        self.pc.connection_state()
    }

    pub async fn close(&self) {
        self.input_allowed.store(false, Ordering::SeqCst);
        if let Err(e) = self.pc.close().await {
            tracing::warn!(error = %e, "peer connection close failed");
        }
        tracing::info!("WebRTC peer closed");
    }
}

/// §1.4 + §10.3b — decode one data channel message and act on it.
async fn handle_message(ctx: &ChannelContext, dc: &Arc<RTCDataChannel>, raw: &[u8]) {
    let Ok(text) = std::str::from_utf8(raw) else {
        return;
    };
    let Ok(msg) = serde_json::from_str::<serde_json::Value>(text) else {
        return;
    };
    let Some(msg_type) = msg.get("type").and_then(|v| v.as_str()) else {
        return;
    };

    if !allow_rate(ctx, msg_type) {
        return;
    }

    // ping is answered regardless of the input gate: it is the connection
    // quality signal (§1.4) and carries no ability to affect the machine.
    if msg_type == "ping" {
        let sent_at = msg.get("t").and_then(|v| v.as_i64()).unwrap_or(0);
        let now = chrono::Utc::now().timestamp_millis();
        let rtt = if sent_at > 0 { now - sent_at } else { 0 };
        let pong = serde_json::json!({ "type": "pong", "t": sent_at, "rtt_ms": rtt });
        let _ = dc.send_text(pong.to_string()).await;
        return;
    }

    // §1.2 — "never injects input before ACTIVE state confirmed via its own
    // RTDB read, not the viewer's claim."
    if !ctx.input_allowed.load(Ordering::SeqCst) {
        tracing::warn!(msg_type, "input rejected — session is not ACTIVE");
        return;
    }

    match msg_type {
        "mouse_move" => {
            let x = msg.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let y = msg.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0);
            with_input(ctx, |i| i.mouse_move(x, y), "mouse_move");
        }
        "mouse_click" => {
            let button = match msg.get("button").and_then(|v| v.as_str()) {
                Some("right") => InputButton::Right,
                Some("middle") => InputButton::Middle,
                _ => InputButton::Left,
            };
            let state = match msg.get("state").and_then(|v| v.as_str()) {
                Some("up") => InputState::Up,
                _ => InputState::Down,
            };
            with_input(ctx, |i| i.mouse_click(button, state), "mouse_click");
        }
        "key_event" => {
            let Some(code) = msg.get("code").and_then(|v| v.as_str()) else {
                return;
            };
            let state = match msg.get("state").and_then(|v| v.as_str()) {
                Some("up") => InputState::Up,
                _ => InputState::Down,
            };
            // §1.7 — log the event type, never the key. A log that records
            // which keys were pressed is a keylogger artifact on disk.
            with_input(ctx, |i| i.key(code, state), "key_event");
        }
        "mouse_scroll" => {
            let dx = msg.get("dx").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let dy = msg.get("dy").and_then(|v| v.as_f64()).unwrap_or(0.0);
            with_input(ctx, |i| i.mouse_scroll(dx, dy), "mouse_scroll");
        }
        "clipboard_text" => {
            let Some(data) = msg.get("data").and_then(|v| v.as_str()) else {
                return;
            };
            with_input(ctx, |i| i.set_clipboard(data), "clipboard_text");
        }
        "file_chunk" => {
            handle_file_chunk(ctx, dc, &msg).await;
        }
        other => {
            // §6.1 — forward compatibility: an unknown type from a newer
            // viewer is ignored, never fatal.
            tracing::debug!(msg_type = other, "unhandled message type");
        }
    }
}

/// Run one input operation under the backend lock.
///
/// The lock is a `std::sync::Mutex` and is never held across an await, so it
/// cannot deadlock the executor. Injection is a single X11/Win32 call in the
/// microsecond range — a tokio Mutex would add async machinery for nothing.
fn with_input<F>(ctx: &ChannelContext, op: F, what: &str)
where
    F: FnOnce(&mut dyn InputBackend) -> Result<()>,
{
    let mut guard = match ctx.input.lock() {
        Ok(g) => g,
        Err(poisoned) => {
            // A panic in a previous injection must not disable input forever.
            tracing::warn!("input backend mutex was poisoned — recovering");
            poisoned.into_inner()
        }
    };
    // §0.2 — view-only host. Dropping the event is the whole behaviour; the
    // viewer's UI learns this from the capabilities it negotiated (§6.1).
    let Some(backend) = guard.as_mut() else {
        tracing::debug!(operation = what, "input dropped — host is view-only");
        return;
    };
    if let Err(e) = op(backend.as_mut()) {
        tracing::warn!(error = %e, operation = what, "input injection failed");
    }
}

/// §10.3c — 100 messages per second per type; excess dropped silently.
fn allow_rate(ctx: &ChannelContext, msg_type: &str) -> bool {
    let mut rate = match ctx.rate.lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    let now = Instant::now();
    let entry = rate.entry(msg_type.to_string()).or_insert((now, 0));

    if now.duration_since(entry.0) >= RATE_LIMIT_WINDOW {
        *entry = (now, 0);
    }

    if entry.1 >= RATE_LIMIT_MAX_PER_WINDOW {
        return false;
    }

    entry.1 += 1;
    true
}

/// §1.4 D — reassemble a chunked transfer by fileId, verify the total count,
/// then acknowledge.
async fn handle_file_chunk(
    ctx: &ChannelContext,
    dc: &Arc<RTCDataChannel>,
    msg: &serde_json::Value,
) {
    let Some(file_id) = msg.get("fileId").and_then(|v| v.as_str()) else {
        return;
    };
    let index = msg.get("index").and_then(|v| v.as_u64()).unwrap_or(0);
    let total = msg.get("total").and_then(|v| v.as_u64()).unwrap_or(0);
    let file_name = msg
        .get("fileName")
        .and_then(|v| v.as_str())
        .unwrap_or("duxo-transfer");
    let Some(b64) = msg.get("data").and_then(|v| v.as_str()) else {
        return;
    };

    if total == 0 {
        return;
    }

    let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(b64) else {
        tracing::warn!(file_id, index, "file chunk was not valid base64 — dropping");
        return;
    };

    let completed = {
        let mut files = match ctx.files.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };

        // §6.2 — reap transfers whose sender went away mid-stream, so a
        // dropped connection cannot pin megabytes of partial data forever.
        let now = Instant::now();
        files.retain(|id, a| {
            let alive = now.duration_since(a.last_chunk_at) < FILE_ASSEMBLY_TIMEOUT;
            if !alive {
                tracing::info!(file_id = %id, "abandoned file transfer discarded");
            }
            alive
        });

        if !files.contains_key(file_id) && !may_start_transfer(&files, bytes.len()) {
            tracing::warn!(
                file_id,
                in_flight = files.len(),
                "refusing a new file transfer — too many already in flight"
            );
            return;
        }

        let assembly = files
            .entry(file_id.to_string())
            .or_insert_with(|| FileAssembly {
                file_name: sanitize_file_name(file_name),
                total,
                received: HashMap::new(),
                bytes: 0,
                last_chunk_at: now,
            });

        assembly.last_chunk_at = now;
        assembly.received.insert(index, bytes);

        // Recomputed from what is actually held, not accumulated per message:
        // a peer that re-sends the same index replaces the stored chunk, so
        // adding each arrival would count the same bytes twice and trip the
        // cap on a transfer that never exceeded it.
        assembly.bytes = assembly.received.values().map(Vec::len).sum();

        // §1.4 — the 10MB cap again, on the receiving side. The viewer checks
        // before starting; the host checks because it cannot assume the peer
        // is the Duxo viewer at all.
        if assembly.bytes > MAX_FILE_BYTES {
            tracing::warn!(file_id, "file transfer exceeded 10MB cap — discarding");
            files.remove(file_id);
            return;
        }

        if assembly.received.len() as u64 == assembly.total {
            files.remove(file_id)
        } else {
            None
        }
    };

    let Some(assembly) = completed else { return };

    // Chunks arrive in order on an ordered channel, but reassembling by index
    // rather than by arrival means an out-of-order delivery cannot silently
    // corrupt the file.
    let mut out = Vec::with_capacity(assembly.bytes);
    for i in 0..assembly.total {
        match assembly.received.get(&i) {
            Some(chunk) => out.extend_from_slice(chunk),
            None => {
                tracing::warn!(file_id, index = i, "missing chunk — discarding transfer");
                return;
            }
        }
    }

    let dest = unique_path(&ctx.download_dir, &assembly.file_name);
    if let Err(e) = std::fs::create_dir_all(&ctx.download_dir) {
        tracing::warn!(error = %e, "could not create download directory");
        return;
    }
    match std::fs::write(&dest, &out) {
        Ok(()) => {
            tracing::info!(
                file_id,
                bytes = out.len(),
                path = %dest.display(),
                "file transfer complete"
            );
            let ack = serde_json::json!({
                "type": "file_complete",
                "fileId": file_id,
                "bytes": out.len(),
            });
            let _ = dc.send_text(ack.to_string()).await;
        }
        Err(e) => {
            tracing::warn!(error = %e, "could not write received file");
        }
    }
}

/// Strip anything that could escape the download directory.
///
/// A viewer supplies this name, so it is untrusted input: `../../.bashrc` and
/// absolute paths both have to stop here, not at the filesystem.
/// Whether a *new* transfer may be admitted alongside the ones in flight.
///
/// Only new transfers are refused. Chunks for a transfer already under way
/// still land, so a legitimate transfer is never starved by one that started
/// after it — the alternative punishes the wrong sender.
fn may_start_transfer(files: &HashMap<String, FileAssembly>, incoming: usize) -> bool {
    if files.len() >= MAX_CONCURRENT_TRANSFERS {
        return false;
    }
    let buffered: usize = files.values().map(|a| a.bytes).sum();
    buffered.saturating_add(incoming) <= MAX_TOTAL_ASSEMBLY_BYTES
}

fn sanitize_file_name(name: &str) -> String {
    let base = name
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or("duxo-transfer")
        .trim()
        .trim_start_matches('.');

    let cleaned: String = base
        .chars()
        .filter(|c| !matches!(c, '\0'..='\x1f' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        .take(200)
        .collect();

    if cleaned.is_empty() {
        "duxo-transfer".to_string()
    } else {
        cleaned
    }
}

/// Never overwrite an existing file — a transfer is not permission to clobber.
fn unique_path(dir: &std::path::Path, name: &str) -> std::path::PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }

    let path = std::path::Path::new(name);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
    let ext = path.extension().and_then(|s| s.to_str());

    for n in 1..1000 {
        let next = match ext {
            Some(e) => dir.join(format!("{stem} ({n}).{e}")),
            None => dir.join(format!("{stem} ({n})")),
        };
        if !next.exists() {
            return next;
        }
    }

    dir.join(format!("{stem}-{}", chrono::Utc::now().timestamp()))
}

fn default_download_dir() -> std::path::PathBuf {
    dirs::download_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("Duxo")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_strips_traversal() {
        assert_eq!(sanitize_file_name("../../etc/passwd"), "passwd");
        assert_eq!(
            sanitize_file_name("/absolute/path/report.pdf"),
            "report.pdf"
        );
        assert_eq!(
            sanitize_file_name("C:\\Windows\\System32\\evil.dll"),
            "evil.dll"
        );
    }

    #[test]
    fn sanitize_rejects_dotfiles_and_empties() {
        // A leading dot would let a transfer land as .bashrc or .ssh-config.
        assert_eq!(sanitize_file_name(".bashrc"), "bashrc");
        assert_eq!(sanitize_file_name(""), "duxo-transfer");
        assert_eq!(sanitize_file_name("   "), "duxo-transfer");
        assert_eq!(sanitize_file_name("/"), "duxo-transfer");
    }

    #[test]
    fn sanitize_drops_control_and_reserved_characters() {
        assert_eq!(sanitize_file_name("re\u{0}port:v2?.txt"), "reportv2.txt");
    }

    #[test]
    fn sanitize_bounds_length() {
        let long = "a".repeat(5000);
        assert!(sanitize_file_name(&long).len() <= 200);
    }

    fn assembly_holding(bytes: usize) -> FileAssembly {
        FileAssembly {
            file_name: "f".into(),
            total: 1,
            received: HashMap::new(),
            bytes,
            last_chunk_at: Instant::now(),
        }
    }

    fn in_flight(count: usize, each: usize) -> HashMap<String, FileAssembly> {
        (0..count)
            .map(|i| (format!("file{i}"), assembly_holding(each)))
            .collect()
    }

    #[test]
    fn a_new_transfer_is_admitted_when_there_is_room() {
        assert!(may_start_transfer(&in_flight(0, 0), 1024));
        assert!(may_start_transfer(&in_flight(3, 1024), 1024));
    }

    #[test]
    fn transfers_are_capped_by_count() {
        // `fileId` is chosen by the peer, so without this the "10MB per file"
        // cap bounds nothing in aggregate — you just open more files.
        let full = in_flight(MAX_CONCURRENT_TRANSFERS, 1);
        assert!(!may_start_transfer(&full, 1));
    }

    #[test]
    fn transfers_are_capped_by_total_bytes() {
        // Few enough transfers to pass the count check, large enough together
        // to fail the byte check — the two limits have to be independent.
        let heavy = in_flight(4, MAX_TOTAL_ASSEMBLY_BYTES / 4);
        assert!(heavy.len() < MAX_CONCURRENT_TRANSFERS);
        assert!(!may_start_transfer(&heavy, 1));
    }

    #[test]
    fn the_byte_cap_cannot_be_overflowed_into_passing() {
        let huge = in_flight(1, usize::MAX);
        assert!(!may_start_transfer(&huge, usize::MAX));
    }

    #[test]
    fn ice_config_without_credentials_yields_stun_only() {
        let cfg = IceConfig {
            stun_urls: vec!["stun:example:3478".into()],
            turn_urls: vec!["turn:example:3478".into()],
            turn_username: None,
            turn_credential: None,
        };
        // A credential-less TURN entry would make ICE burn its whole timeout
        // on allocations that are always refused.
        assert_eq!(cfg.to_servers().len(), 1);
    }

    #[test]
    fn ice_config_with_credentials_includes_turn() {
        let cfg = IceConfig {
            stun_urls: vec!["stun:example:3478".into()],
            turn_urls: vec!["turn:example:3478".into()],
            turn_username: Some("u".into()),
            turn_credential: Some("p".into()),
        };
        assert_eq!(cfg.to_servers().len(), 2);
    }
}
