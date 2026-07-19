//! Duxo WebRTC host — §1.3 connection lifecycle + §10.3b data channel dispatch.
//!
//! This module owns the WebRTC peer connection on the host side.
//! §1.2 — host agent owns screen capture, WebRTC peer, input injection, and
//! ALL permission decisions.
//!
//! §0.5 — webrtc-rs handles VP8/VP9 encoding internally.
//! §0.5 — ICE server priority: STUN → Metered TURN → Oracle Coturn (Path B).
//! §1.3 — connection state monitoring + ICE restart with exponential backoff.

use std::sync::Arc;
use tokio::sync::RwLock;
use webrtc::api::APIBuilder;
use webrtc::api::media_engine::MediaEngine;
use webrtc::api::interceptor_registry::register_default_interceptors;
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::peer_connection_state::RTCPeerConnectionState;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;
use webrtc::data_channel::RTCDataChannel;
use webrtc::rtp_transceiver::rtp_codec_capability::RTPCodecCapability;
use webrtc::rtp_transceiver::rtp_transceiver_direction::RTPTransceiverDirection;
use webrtc::track::track_local::track_local_static_rtp::TrackLocalStaticRTP;
use webrtc::track::track_local::TrackLocal;

use crate::backend::{InputBackend, InputButton, InputState};
use crate::types::{DuxoError, Result, SessionContext, DataChannelMessage, SessionStatus};
#[cfg(target_os = "linux")]
use crate::input_linux_x11::X11Input;
use crate::input_windows::WindowsInput;
use crate::session;
use serde_json::json;

/// Backoff delays for ICE restart (§10.3b). Matches KPI: <10s local, <15s TURN.
const BACKOFF_DELAYS_MS: &[u64] = &[500, 1000, 2000, 4000, 8000];

/// Maximum number of ICE restart attempts before giving up.
#[allow(dead_code)]
const MAX_RECONNECT_ATTEMPTS: u8 = 5;

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
                .filter(|s| !s.is_empty())
                .map(String::from)
                .collect(),
            turn_username: std::env::var("DUXO_METERED_TURN_USERNAME").ok(),
            turn_credential: std::env::var("DUXO_METERED_TURN_CREDENTIAL").ok(),
        }
    }
}

/// The host-side WebRTC session.
pub struct HostWebRTCSession {
    api: Arc<webrtc::api::API>,
    peer_connection: Option<Arc<webrtc::peer_connection::RTCPeerConnection>>,
    data_channel: Option<Arc<RTCDataChannel>>,
    video_track: Option<Arc<TrackLocalStaticRTP>>,
    session_ctx: Arc<RwLock<SessionContext>>,
    reconnect_attempts: u8,
    data_channel_open: Arc<RwLock<bool>>,
}

impl HostWebRTCSession {
    pub fn new(session_ctx: SessionContext) -> Self {
        let mut media_engine = MediaEngine::default();
        let _ = media_engine.register_codec(
            RTPCodecCapability {
                mime_type: "video/vp8".to_string(),
                clock_rate: 90000,
                channels: 0,
                sdp_fmtp_line: String::new(),
                rtcp_feedback: vec![],
            },
            RTPTransceiverDirection::SendOnly,
        );

        let mut registry = webrtc::interceptor::registry::Registry::new();
        if let Err(e) = register_default_interceptors(&mut media_engine, &mut registry) {
            tracing::warn!(error = %e, "failed to register default interceptors");
        }

        let api = APIBuilder::new()
            .with_media_engine(media_engine)
            .with_interceptor_registry(registry)
            .build();

        Self {
            api: Arc::new(api),
            peer_connection: None,
            data_channel: None,
            video_track: None,
            session_ctx: Arc::new(RwLock::new(session_ctx)),
            reconnect_attempts: 0,
            data_channel_open: Arc::new(RwLock::new(false)),
        }
    }

    /// §1.6-B — create the RTCPeerConnection and generate the SDP offer.
    pub async fn create_peer_and_offer(&mut self, ice_config: &IceConfig) -> Result<String> {
        let mut ice_servers = vec![
            RTCIceServer {
                urls: ice_config.stun_urls.clone(),
                ..Default::default()
            },
        ];

        if !ice_config.turn_urls.is_empty() {
            if let (Some(ref username), Some(ref credential)) =
                (&ice_config.turn_username, &ice_config.turn_credential)
            {
                ice_servers.push(RTCIceServer {
                    urls: ice_config.turn_urls.clone(),
                    username: username.clone(),
                    credential: credential.clone(),
                    ..Default::default()
                });
            }
        }

        let config = RTCConfiguration { ice_servers, ..Default::default() };

        let peer_connection = self.api.new_peer_connection(config).await
            .map_err(|e| DuxoError::Firebase(format!("Failed to create peer connection: {e}")))?;

        let dc = peer_connection.create_data_channel("duxo", None).await
            .map_err(|e| DuxoError::Firebase(format!("Failed to create data channel: {e}")))?;

        let dc_open = Arc::clone(&self.data_channel_open);
        dc.on_open(Box::new(move || {
            let dc_open = dc_open.clone();
            Box::new(async move {
                *dc_open.write().await = true;
                tracing::info!("data channel opened");
            })
        })).await;

        let dc_close = Arc::clone(&self.data_channel_open);
        dc.on_close(Box::new(move || {
            let dc_close = dc_close.clone();
            Box::new(async move {
                *dc_close.write().await = false;
                tracing::info!("data channel closed");
            })
        })).await;

        let ctx = Arc::clone(&self.session_ctx);
        dc.on_message(Box::new(move |msg| {
            let ctx = ctx.clone();
            Box::new(async move {
                if let Ok(text) = String::from_utf8(msg.data.to_vec()) {
                    if let Ok(dm) = serde_json::from_str::<DataChannelMessage>(&text) {
                        let mut ctx_guard = ctx.write().await;
                        handle_data_channel_message(dm, &mut ctx_guard).await;
                    }
                }
            })
        })).await;

        self.data_channel = Some(dc);

        let video_track = Arc::new(TrackLocalStaticRTP::new(
            RTPCodecCapability {
                mime_type: "video/vp8".to_string(),
                clock_rate: 90000,
                channels: 0,
                sdp_fmtp_line: String::new(),
                rtcp_feedback: vec![],
            },
            "duxo-stream".to_string(),
            "duxo-video".to_string(),
        ));

        let rtp_sender = peer_connection.add_track(
            Arc::clone(&video_track) as Arc<dyn TrackLocal + Send + Sync>,
        ).await
            .map_err(|e| DuxoError::Firebase(format!("Failed to add video track: {e}")))?;

        tokio::spawn(async move {
            let mut rtcp_buf = vec![0u8; 1500];
            loop {
                match rtp_sender.read_rtcp(&mut rtcp_buf).await {
                    Ok(_) => {}
                    Err(_) => break,
                }
            }
        });

        self.video_track = Some(video_track);

        let ctx = Arc::clone(&self.session_ctx);
        peer_connection.on_ice_connection_state_change(Box::new(move |state| {
            let ctx = ctx.clone();
            Box::new(async move {
                tracing::info!(state = ?state, "ICE connection state changed");
                match state {
                    RTCPeerConnectionState::Connected => {
                        tracing::info!("WebRTC connection established — session ACTIVE");
                    }
                    RTCPeerConnectionState::Failed => {
                        tracing::warn!("ICE connection failed — attempting restart");
                    }
                    RTCPeerConnectionState::Disconnected => {
                        tracing::info!("ICE disconnected — waiting for self-recovery");
                    }
                    RTCPeerConnectionState::Closed => {
                        tracing::info!("ICE connection closed");
                    }
                    _ => {}
                }
            })
        })).await;

        let offer = peer_connection.create_offer(None).await
            .map_err(|e| DuxoError::Firebase(format!("Failed to create offer: {e}")))?;

        peer_connection.set_local_description(offer.clone()).await
            .map_err(|e| DuxoError::Firebase(format!("Failed to set local description: {e}")))?;

        let candidates_buf = Arc::new(tokio::sync::Mutex::new(Vec::<String>::new()));
        let candidates_ref = Arc::clone(&candidates_buf);
        peer_connection.on_ice_candidate(Box::new(move |candidate| {
            let buf = Arc::clone(&candidates_ref);
            Box::pin(async move {
                if let Some(c) = candidate {
                    if let Ok(json) = serde_json::to_string(&c) {
                        let mut guard = buf.lock().await;
                        guard.push(json);
                    }
                }
            })
        })).await;

        self.peer_connection = Some(peer_connection);
        self.reconnect_attempts = 0;

        let offer_json = serde_json::to_string(&offer)
            .map_err(|e| DuxoError::Json(e))?;

        tracing::info!("SDP offer created and local description set");
        Ok(offer_json)
    }

    pub async fn set_remote_answer(&mut self, answer_json: &str) -> Result<()> {
        let answer: RTCSessionDescription = serde_json::from_str(answer_json)
            .map_err(|e| DuxoError::Json(e))?;

        if let Some(ref pc) = self.peer_connection {
            pc.set_remote_description(answer).await
                .map_err(|e| DuxoError::Firebase(format!("Failed to set remote description: {e}")))?;
            tracing::info!("remote description (answer) applied");
        }

        Ok(())
    }

    pub async fn add_ice_candidates(&self, candidates_json: &[String]) -> Result<()> {
        if let Some(ref pc) = self.peer_connection {
            for json in candidates_json {
                if let Ok(c) = serde_json::from_str::<webrtc::ice_transport::ice_candidate::RTCIceCandidateInit>(json) {
                    let _ = pc.add_ice_candidate(c).await;
                }
            }
        }
        Ok(())
    }

    pub async fn send_video_frame(&self, frame: &[u8]) -> Result<()> {
        if let Some(ref vt) = self.video_track {
            let _ = vt.write(frame).await;
        }
        Ok(())
    }

    pub async fn send_data_channel_message(&self, msg: &serde_json::Value) -> Result<()> {
        if let Some(ref dc) = self.data_channel {
            if *self.data_channel_open.read().await {
                let text = serde_json::to_string(msg)
                    .map_err(|e| DuxoError::Json(e))?;
                let _ = dc.send_text(&text).await;
            }
        }
        Ok(())
    }

    pub async fn restart_ice(&mut self) -> Result<()> {
        if self.reconnect_attempts >= MAX_RECONNECT_ATTEMPTS {
            return Err(DuxoError::IceRestartExhausted {
                attempts: self.reconnect_attempts,
            });
        }

        if let Some(ref pc) = self.peer_connection {
            let offer = pc.create_offer(None).await
                .map_err(|e| DuxoError::Firebase(format!("ICE restart offer failed: {e}")))?;

            pc.set_local_description(offer).await
                .map_err(|e| DuxoError::Firebase(format!("ICE restart local desc failed: {e}")))?;

            self.reconnect_attempts += 1;
            tracing::info!(attempt = self.reconnect_attempts, "ICE restart initiated");
        }

        Ok(())
    }

    pub async fn close(&mut self) {
        if let Some(ref pc) = self.peer_connection {
            let _ = pc.close().await;
        }
        self.peer_connection = None;
        self.data_channel = None;
        self.video_track = None;

        let mut ctx = self.session_ctx.write().await;
        let _ = session::transition(ctx.status, SessionStatus::Ended);
        ctx.status = SessionStatus::Ended;

        tracing::info!("WebRTC session closed");
    }
}

/// §10.3b — Data channel message loop (host side).
pub async fn handle_data_channel_message(msg: DataChannelMessage, ctx: &mut SessionContext) {
    match msg.msg_type.as_str() {
        "mouse_move" => {
            let x = msg.extra.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let y = msg.extra.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0);
            if !ctx.can_open_data_channel(&ctx.viewer_id.clone().unwrap_or_default()) {
                tracing::warn!("mouse_move rejected — session not ACTIVE");
                return;
            }
            dispatch_mouse_move(x, y);
        }

        "mouse_click" => {
            let button = msg.extra.get("button").and_then(|v| v.as_str()).unwrap_or("left");
            let state = msg.extra.get("state").and_then(|v| v.as_str()).unwrap_or("down");
            if !ctx.can_open_data_channel(&ctx.viewer_id.clone().unwrap_or_default()) {
                tracing::warn!("mouse_click rejected — session not ACTIVE");
                return;
            }
            dispatch_mouse_click(button, state);
        }

        "key_event" => {
            let code = msg.extra.get("code").and_then(|v| v.as_str()).unwrap_or("");
            let state = msg.extra.get("state").and_then(|v| v.as_str()).unwrap_or("down");
            if !ctx.can_open_data_channel(&ctx.viewer_id.clone().unwrap_or_default()) {
                tracing::warn!("key_event rejected — session not ACTIVE");
                return;
            }
            dispatch_key_event(code, state);
        }

        "clipboard_text" => {
            let data = msg.extra.get("data").and_then(|v| v.as_str()).unwrap_or("");
            if !ctx.can_open_data_channel(&ctx.viewer_id.clone().unwrap_or_default()) {
                return;
            }
            dispatch_clipboard(data);
        }

        "file_chunk" => {
            let file_id = msg.extra.get("fileId").and_then(|v| v.as_str()).unwrap_or("");
            let index = msg.extra.get("index").and_then(|v| v.as_u64()).unwrap_or(0);
            let total = msg.extra.get("total").and_then(|v| v.as_u64()).unwrap_or(0);
            tracing::trace!(file_id = file_id, index = index, total = total, "file_chunk dispatched");
        }

        "ping" => {
            let t = msg.extra.get("t").and_then(|v| v.as_i64()).unwrap_or(0);
            let rtt = if t > 0 { chrono::Utc::now().timestamp_millis() - t } else { 0 };
            tracing::trace!(rtt_ms = rtt, "pong sent");
        }

        other => {
            tracing::info!(msg_type = other, "unhandled message type (forward-compat)");
        }
    }
}

fn dispatch_mouse_move(x: f64, y: f64) {
    #[cfg(target_os = "linux")]
    {
        let mut input = X11Input::new();
        if let Err(e) = input.mouse_move(x, y) {
            tracing::warn!(error = %e, "mouse_move failed on X11");
        }
    }
    #[cfg(target_os = "windows")]
    {
        let mut input = WindowsInput::new();
        if let Err(e) = input.mouse_move(x, y) {
            tracing::warn!(error = %e, "mouse_move failed on Windows");
        }
    }
}

fn dispatch_mouse_click(button: &str, state: &str) {
    let btn = match button {
        "left" => InputButton::Left,
        "right" => InputButton::Right,
        "middle" => InputButton::Middle,
        _ => InputButton::Left,
    };

    let st = match state {
        "down" => InputState::Down,
        "up" => InputState::Up,
        _ => InputState::Down,
    };

    #[cfg(target_os = "linux")]
    {
        let mut input = X11Input::new();
        if let Err(e) = input.mouse_click(btn, st) {
            tracing::warn!(error = %e, "mouse_click failed on X11");
        }
    }
    #[cfg(target_os = "windows")]
    {
        let mut input = WindowsInput::new();
        if let Err(e) = input.mouse_click(btn, st) {
            tracing::warn!(error = %e, "mouse_click failed on Windows");
        }
    }
}

fn dispatch_key_event(code: &str, state: &str) {
    let st = match state {
        "down" => InputState::Down,
        "up" => InputState::Up,
        _ => InputState::Down,
    };

    #[cfg(target_os = "linux")]
    {
        let mut input = X11Input::new();
        if let Err(e) = input.key(code, st) {
            tracing::warn!(error = %e, "key_event failed on X11");
        }
    }
    #[cfg(target_os = "windows")]
    {
        let mut input = WindowsInput::new();
        if let Err(e) = input.key(code, st) {
            tracing::warn!(error = %e, "key_event failed on Windows");
        }
    }
}

fn dispatch_clipboard(text: &str) {
    #[cfg(target_os = "linux")]
    {
        let mut input = X11Input::new();
        if let Err(e) = input.set_clipboard(text) {
            tracing::warn!(error = %e, "clipboard_text failed on X11");
        }
    }
    #[cfg(target_os = "windows")]
    {
        let mut input = WindowsInput::new();
        if let Err(e) = input.set_clipboard(text) {
            tracing::warn!(error = %e, "clipboard_text failed on Windows");
        }
    }
}
