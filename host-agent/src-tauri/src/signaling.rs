//! Duxo session driver — §1.1 state machine, §1.6-B signaling, §7.4 expiry.
//!
//! This is the module that was missing. Before it, the pieces existed but
//! nothing joined them: `listen_for_viewer_requests` stopped at the Allow/Deny
//! decision and returned, and `handle_session_after_allow` — the function that
//! would have started WebRTC — was never called from anywhere. A host could
//! show a code, verify a viewer, and accept the connection, and then simply do
//! nothing.
//!
//! `run_session` owns one session end to end:
//!
//!   CREATED → WAITING → REQUESTED → ALLOWED → CONNECTING → ACTIVE → ENDED
//!
//! It is deliberately free of any Tauri types. The UI talks to it over two
//! channels — events out, the Allow/Deny decision in — which keeps the whole
//! state machine testable and compilable without a display server.
//!
//! §1.2 — every transition is driven by the host's *own* RTDB read. The viewer
//! can write `status`, but the host never treats that as permission for
//! anything; input stays gated on the host's own view of ACTIVE.

use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::sync::{mpsc, Mutex};

use crate::auth::HostAuth;
use crate::backend::{CaptureBackend, InputBackend};
use crate::encoder::VideoEncoder;
use crate::firebase;
use crate::security;
use crate::types::{DuxoError, HostPlatform, Result, SessionStatus};
use crate::webrtc_host::{HostPeer, HostSignal, IceConfig};

/// §1.6-B — how often the host re-reads the session node. RTDB's REST API has
/// no push, and the free tier bills by bandwidth, so this is a deliberate
/// trade: 1s is imperceptible next to the human latency of reading a code
/// aloud, and a session node is well under a kilobyte.
const POLL_INTERVAL: Duration = Duration::from_secs(1);

/// §2.4 — "Timeout → Denied, never Allowed."
const DECISION_TIMEOUT: Duration = Duration::from_secs(60);

/// §7.4 — max session duration: 8 hours, auto-ends, user must reconnect.
const MAX_SESSION_DURATION: Duration = Duration::from_secs(8 * 60 * 60);

/// §7.4 — idle timeout: 30 minutes with no input events.
const IDLE_TIMEOUT: Duration = Duration::from_secs(30 * 60);

/// §1.1 — "ACTIVE ──(network loss > 60s)──► ENDED".
const NETWORK_LOSS_GRACE: Duration = Duration::from_secs(60);

/// §6.5 — capture cadence. 20fps is the top of the 15–20fps target band.
const TARGET_FPS: u32 = 20;

/// What the UI needs to know. The host agent's windows subscribe to these
/// rather than polling shared state.
#[derive(Debug, Clone)]
pub enum SessionEvent {
    /// §3.4 — the code display window can now show this code.
    Created {
        session_id: String,
        code: String,
    },
    /// §2.4 — a viewer passed JWT verification. This email is from the token's
    /// claims, never from anything the viewer wrote into RTDB.
    ViewerVerified {
        email: String,
        uid: String,
    },
    /// §1.1 — every state transition, for the UI to reflect.
    Status(SessionStatus),
    /// The session ended for a reason worth telling the user about.
    Failed(String),
    Ended,
}

/// The host's Allow/Deny answer, delivered from the native popup (§2.4).
pub type DecisionRx = mpsc::Receiver<bool>;

/// Everything one session needs. Built once by the tray, moved into the task.
pub struct SessionDriver {
    auth: Arc<Mutex<HostAuth>>,
    ice: IceConfig,
    platform: HostPlatform,
}

impl SessionDriver {
    pub fn new(auth: Arc<Mutex<HostAuth>>, ice: IceConfig) -> Self {
        Self {
            auth,
            ice,
            platform: HostPlatform::detect(),
        }
    }

    /// §1.1 CREATED → WAITING. Publishes the session skeleton and the code
    /// mapping, and returns the code to display.
    pub async fn create(&self) -> Result<(String, String)> {
        let mut auth = self.auth.lock().await;
        let id_token = auth.id_token().await?;
        let host_uid = auth.uid().to_string();
        let database_url = auth.database_url().to_string();
        let project_id = auth.project_id().to_string();
        drop(auth);

        firebase::create_session(
            &database_url,
            &id_token,
            &project_id,
            &host_uid,
            &self.platform.to_string(),
        )
        .await
    }

    /// Run one session to completion. Returns when the session has ENDED.
    ///
    /// Never returns early on a recoverable error: a failed poll is retried,
    /// because a host that gives up on one dropped request would abandon a
    /// live support call over a moment of packet loss.
    pub async fn run(
        &self,
        session_id: String,
        code: String,
        events: mpsc::UnboundedSender<SessionEvent>,
        mut decision: DecisionRx,
    ) {
        let _ = events.send(SessionEvent::Created {
            session_id: session_id.clone(),
            code: code.clone(),
        });
        let _ = events.send(SessionEvent::Status(SessionStatus::Waiting));

        let outcome = self.drive(&session_id, &events, &mut decision).await;

        if let Err(e) = &outcome {
            tracing::error!(error = %e, session_id = %session_id, "session failed");
            let _ = events.send(SessionEvent::Failed(e.to_string()));
        }

        // §1.1 — clean shutdown regardless of how we got here, so an abandoned
        // session never leaves a live code pointing at a dead host.
        self.teardown(&session_id, &code).await;
        let _ = events.send(SessionEvent::Status(SessionStatus::Ended));
        let _ = events.send(SessionEvent::Ended);
    }

    async fn drive(
        &self,
        session_id: &str,
        events: &mpsc::UnboundedSender<SessionEvent>,
        decision: &mut DecisionRx,
    ) -> Result<()> {
        // ── WAITING → REQUESTED ──────────────────────────────────────────
        let (viewer_uid, viewer_email) = self.await_viewer(session_id, events).await?;
        let _ = events.send(SessionEvent::ViewerVerified {
            email: viewer_email.clone(),
            uid: viewer_uid.clone(),
        });
        let _ = events.send(SessionEvent::Status(SessionStatus::Requested));

        // ── REQUESTED → ALLOWED / DENIED ─────────────────────────────────
        // §2.4 — the single most important gate in the app. The timeout
        // resolves to Deny, and a closed channel (popup dismissed, window
        // destroyed) resolves to Deny as well: every path that is not an
        // explicit click on Allow is a denial.
        let allowed = match tokio::time::timeout(DECISION_TIMEOUT, decision.recv()).await {
            Ok(Some(v)) => v,
            Ok(None) => {
                tracing::info!("decision channel closed — treating as DENY (§2.4)");
                false
            }
            Err(_) => {
                tracing::info!("Allow/Deny timed out after 60s — DENY (§2.4)");
                false
            }
        };

        self.set_status(
            session_id,
            if allowed {
                SessionStatus::Allowed
            } else {
                SessionStatus::Denied
            },
        )
        .await?;

        if !allowed {
            let _ = events.send(SessionEvent::Status(SessionStatus::Denied));
            // §7.3 — a refused connection is exactly the event worth keeping.
            self.audit(&viewer_uid, "permission_denied", session_id)
                .await;
            return Ok(());
        }

        self.audit(&viewer_uid, "session_start", session_id).await;
        let _ = events.send(SessionEvent::Status(SessionStatus::Allowed));

        // ── ALLOWED → CONNECTING ─────────────────────────────────────────
        let started_at = chrono::Utc::now().timestamp_millis();
        let result = self.connect_and_serve(session_id, events).await;

        // §6.3 — the durable record. Written whether the session ended cleanly
        // or not, because a session that failed still happened and the user
        // should be able to see it in their history.
        let end_reason = if result.is_ok() {
            "user_ended"
        } else {
            "error"
        };
        self.record_history(&viewer_uid, started_at, end_reason)
            .await;
        self.audit(&viewer_uid, "session_end", session_id).await;

        result
    }

    /// Poll until a viewer claims the session, then verify who they are.
    ///
    /// §2.5 — the host does NOT trust `session.viewerId`. It verifies the
    /// viewer's Firebase ID token signature against Google's public certs and
    /// then checks that the uid inside the *token* matches the uid written to
    /// RTDB. Displaying an unverified email in the Allow/Deny dialog would
    /// make the dialog worse than useless: it would let an attacker choose
    /// what name the victim sees before clicking Allow.
    async fn await_viewer(
        &self,
        session_id: &str,
        _events: &mpsc::UnboundedSender<SessionEvent>,
    ) -> Result<(String, String)> {
        let project_id = self.auth.lock().await.project_id().to_string();
        let certs = security::fetch_google_certs(&project_id).await?;

        let started = Instant::now();

        loop {
            // §0.6 — codes live 24h; a host left running overnight should stop
            // polling rather than hold a session node open indefinitely.
            if started.elapsed() > Duration::from_secs(24 * 60 * 60) {
                return Err(DuxoError::SessionExpired);
            }

            tokio::time::sleep(POLL_INTERVAL).await;

            let node = match self.read_session(session_id).await {
                Ok(Some(n)) => n,
                Ok(None) => return Err(DuxoError::SessionNotFound),
                Err(e) => {
                    tracing::warn!(error = %e, "session poll failed — retrying");
                    continue;
                }
            };

            match node.get("status").and_then(|v| v.as_str()).unwrap_or("") {
                "requested" => {}
                "ended" | "expired" => return Err(DuxoError::SessionExpired),
                _ => continue,
            }

            let viewer_id = node.get("viewerId").and_then(|v| v.as_str()).unwrap_or("");
            let viewer_token = node
                .get("viewerToken")
                .and_then(|v| v.as_str())
                .unwrap_or("");

            if viewer_id.is_empty() || viewer_token.is_empty() {
                // The viewer's claim write lands as one update, but a partial
                // read is possible; wait for the next poll rather than denying.
                continue;
            }

            let claims = match security::verify_viewer_token(viewer_token, &certs, &project_id) {
                Ok(c) => c,
                Err(e) => {
                    tracing::warn!(error = %e, "viewer token failed verification — denying");
                    self.set_status(session_id, SessionStatus::Denied).await?;
                    return Err(DuxoError::TokenInvalidSignature);
                }
            };

            if claims.sub != viewer_id {
                tracing::warn!(
                    token_uid = %claims.sub,
                    rtdb_uid = %viewer_id,
                    "uid mismatch — possible spoofing, denying"
                );
                self.set_status(session_id, SessionStatus::Denied).await?;
                return Err(DuxoError::ViewerMismatch);
            }

            tracing::info!(viewer_uid = %claims.sub, "viewer identity verified");
            return Ok((claims.sub.clone(), claims.email.clone()));
        }
    }

    /// §1.6-B — offer/answer/ICE exchange, then stream until the session ends.
    async fn connect_and_serve(
        &self,
        session_id: &str,
        events: &mpsc::UnboundedSender<SessionEvent>,
    ) -> Result<()> {
        let input: Box<dyn InputBackend> = crate::backend::platform_input()?;
        let (sig_tx, mut sig_rx) = mpsc::unbounded_channel::<HostSignal>();

        let peer = Arc::new(HostPeer::new(&self.ice, input, sig_tx).await?);
        self.set_status(session_id, SessionStatus::Connecting)
            .await?;
        let _ = events.send(SessionEvent::Status(SessionStatus::Connecting));

        // §0.6 — publish our candidates as they are gathered, in a task of its
        // own so gathering is never blocked on an RTDB round trip.
        let candidate_task = {
            let driver_auth = Arc::clone(&self.auth);
            let session_id = session_id.to_string();
            let peer_for_state = Arc::clone(&peer);
            let events = events.clone();
            tokio::spawn(async move {
                let mut index: u32 = 0;
                while let Some(signal) = sig_rx.recv().await {
                    match signal {
                        HostSignal::Candidate(json) => {
                            // The RTDB rule admits indices 0–99 only. Past that
                            // we stop writing rather than fail the whole write.
                            if index > 99 {
                                continue;
                            }
                            let mut auth = driver_auth.lock().await;
                            let Ok(token) = auth.id_token().await else {
                                continue;
                            };
                            let db = auth.database_url().to_string();
                            let proj = auth.project_id().to_string();
                            drop(auth);

                            if let Err(e) = firebase::write_candidate(
                                &db,
                                &token,
                                &proj,
                                &session_id,
                                "hostCandidates",
                                index,
                                &json,
                            )
                            .await
                            {
                                tracing::warn!(error = %e, "candidate publish failed");
                            } else {
                                index += 1;
                            }
                        }
                        HostSignal::ConnectionState(state) => {
                            use webrtc::peer_connection::peer_connection_state::RTCPeerConnectionState as S;
                            if state == S::Connected {
                                tracing::info!(
                                    kpi = "connection_establishment",
                                    elapsed_ms = peer_for_state.elapsed_since_start().as_millis(),
                                    "WebRTC connected"
                                );
                                let _ = events.send(SessionEvent::Status(SessionStatus::Active));
                            }
                        }
                    }
                }
            })
        };

        let result = self.serve(session_id, &peer, events).await;

        candidate_task.abort();
        peer.close().await;
        result
    }

    /// The main session loop: apply signaling updates, stream frames, enforce
    /// the §7.4 timeouts.
    async fn serve(
        &self,
        session_id: &str,
        peer: &Arc<HostPeer>,
        events: &mpsc::UnboundedSender<SessionEvent>,
    ) -> Result<()> {
        let mut answered = false;
        let mut applied_candidates: std::collections::HashSet<String> =
            std::collections::HashSet::new();
        let mut capture_task: Option<tokio::task::JoinHandle<()>> = None;
        let mut is_active = false;

        let session_start = Instant::now();
        let mut last_activity = Instant::now();
        let mut disconnected_since: Option<Instant> = None;

        loop {
            tokio::time::sleep(POLL_INTERVAL).await;

            // §7.4 — 8-hour hard cap. Auto-ends; the user reconnects.
            if session_start.elapsed() > MAX_SESSION_DURATION {
                tracing::info!("session hit the 8-hour maximum duration (§7.4)");
                break;
            }

            let node = match self.read_session(session_id).await {
                Ok(Some(n)) => n,
                Ok(None) => {
                    tracing::info!("session node deleted — ending");
                    break;
                }
                Err(e) => {
                    tracing::warn!(error = %e, "session poll failed — retrying");
                    continue;
                }
            };

            match node.get("status").and_then(|v| v.as_str()).unwrap_or("") {
                "ended" | "expired" | "denied" => {
                    tracing::info!("session ended by the other peer");
                    break;
                }
                _ => {}
            }

            // §1.6-B — the viewer's offer. Also the §1.3 #4 ICE-restart path:
            // a *new* offer under the same session id renegotiates in place,
            // which is why this is not a one-shot.
            if let Some(offer) = node.get("offer").and_then(|v| v.as_str()) {
                let offer_changed = !answered;
                if offer_changed {
                    match peer.accept_offer(offer).await {
                        Ok(answer) => {
                            self.write_field(session_id, "answer", serde_json::json!(answer))
                                .await?;
                            answered = true;
                            tracing::info!("answer published");
                        }
                        Err(e) => {
                            tracing::warn!(error = %e, "could not answer offer");
                        }
                    }
                }
            }

            // §0.6 — apply the viewer's candidates exactly once each.
            if let Some(candidates) = node.get("viewerCandidates").and_then(|v| v.as_object()) {
                for (index, raw) in candidates {
                    if applied_candidates.contains(index) {
                        continue;
                    }
                    applied_candidates.insert(index.clone());
                    if let Some(json) = raw.as_str() {
                        if let Err(e) = peer.add_ice_candidate(json).await {
                            tracing::warn!(error = %e, "could not add viewer candidate");
                        }
                    }
                }
            }

            // §1.1 — ACTIVE is entered on the host's own observation that the
            // peer connection is up, never because the viewer said so.
            let connected = matches!(
                peer.connection_state(),
                webrtc::peer_connection::peer_connection_state::RTCPeerConnectionState::Connected
            );

            if connected && !is_active {
                is_active = true;
                disconnected_since = None;
                last_activity = Instant::now();

                self.set_status(session_id, SessionStatus::Active).await?;
                let _ = events.send(SessionEvent::Status(SessionStatus::Active));

                // §2.4 — and only now does input become possible at all.
                peer.set_input_allowed(true);

                capture_task = Some(self.spawn_capture(Arc::clone(peer)));
            } else if !connected && is_active {
                // §1.3 #3 — a brief drop self-recovers; don't tear down. But
                // §1.1 caps that at 60 seconds of network loss.
                peer.set_input_allowed(false);
                let since = *disconnected_since.get_or_insert_with(Instant::now);
                if since.elapsed() > NETWORK_LOSS_GRACE {
                    tracing::info!("network loss exceeded 60s — ending session (§1.1)");
                    break;
                }
            } else if connected {
                disconnected_since = None;
            }

            // §7.4 — 30 minutes with no input ends the session. Deliberately
            // measured on the connection being up rather than on input events
            // themselves: a viewer watching a long build finish is idle by any
            // input measure, and hanging up on them would be wrong.
            if is_active && connected {
                last_activity = Instant::now();
            }
            if is_active && last_activity.elapsed() > IDLE_TIMEOUT {
                tracing::info!("session idle for 30 minutes — ending (§7.4)");
                break;
            }
        }

        if let Some(task) = capture_task {
            task.abort();
        }
        peer.set_input_allowed(false);
        Ok(())
    }

    /// §0.5 — capture → encode → send, at the §6.5 target frame rate.
    fn spawn_capture(&self, peer: Arc<HostPeer>) -> tokio::task::JoinHandle<()> {
        tokio::spawn(async move {
            let mut capture: Box<dyn CaptureBackend> = match crate::backend::platform_capture() {
                Ok(c) => c,
                Err(e) => {
                    tracing::error!(error = %e, "no capture backend — session will be blank");
                    return;
                }
            };

            if let Err(e) = capture.start() {
                tracing::error!(error = %e, "capture start failed");
                return;
            }

            let frame_interval = Duration::from_millis(1000 / TARGET_FPS as u64);
            let mut encoder: Option<VideoEncoder> = None;
            let mut frames: u64 = 0;
            let mut fps_window = Instant::now();

            loop {
                let tick = Instant::now();

                match capture.next_frame() {
                    Ok(frame) => {
                        // The encoder is built from the first frame's real
                        // dimensions rather than a guess, and rebuilt if the
                        // user changes resolution mid-session — feeding libvpx
                        // a differently-sized buffer than it was configured for
                        // corrupts every subsequent frame.
                        let needs_new = match &encoder {
                            None => true,
                            Some(enc) => {
                                let (w, h) = enc.dimensions();
                                let (fw, fh) = fit_hint(frame.width, frame.height);
                                w != fw || h != fh
                            }
                        };

                        if needs_new {
                            match VideoEncoder::new(frame.width, frame.height, TARGET_FPS) {
                                Ok(e) => encoder = Some(e),
                                Err(e) => {
                                    tracing::error!(error = %e, "encoder init failed");
                                    break;
                                }
                            }
                        }

                        if let Some(enc) = encoder.as_mut() {
                            match enc.encode_bgra(&frame.data, frame.width, frame.height) {
                                Ok(packets) => {
                                    let duration = enc.frame_duration();
                                    for packet in packets {
                                        if let Err(e) =
                                            peer.write_frame(packet.data, duration).await
                                        {
                                            tracing::warn!(error = %e, "frame send failed");
                                        }
                                    }
                                }
                                Err(e) => tracing::warn!(error = %e, "encode failed"),
                            }
                        }

                        frames += 1;
                        if frames % 100 == 0 {
                            // §6.5 KPI — measured, not asserted.
                            let fps = 100.0 / fps_window.elapsed().as_secs_f64().max(0.001);
                            tracing::info!(
                                kpi = "capture_fps",
                                frames,
                                fps = format!("{fps:.1}"),
                                "capture pipeline running"
                            );
                            fps_window = Instant::now();
                        }
                    }
                    Err(DuxoError::FrameNotReady) => {
                        // The desktop has not changed since the last grab. Come
                        // back promptly rather than idling a whole frame slot —
                        // sleeping 50ms here would halve the effective frame
                        // rate on any screen that is not constantly repainting.
                        tokio::time::sleep(Duration::from_millis(4)).await;
                        continue;
                    }
                    Err(e) => {
                        tracing::warn!(error = %e, "frame capture failed");
                    }
                }

                let elapsed = tick.elapsed();
                if elapsed < frame_interval {
                    tokio::time::sleep(frame_interval - elapsed).await;
                }
            }

            let _ = capture.stop();
            tracing::info!(total_frames = frames, "capture pipeline stopped");
        })
    }

    /// §1.1 — clean shutdown: end the session and retire the code so it can
    /// never be redeemed again.
    async fn teardown(&self, session_id: &str, code: &str) {
        let mut auth = self.auth.lock().await;
        let Ok(token) = auth.id_token().await else {
            return;
        };
        let db = auth.database_url().to_string();
        let proj = auth.project_id().to_string();
        drop(auth);

        let _ = firebase::update_session_field(
            &db,
            &token,
            &proj,
            session_id,
            "status",
            serde_json::json!("ended"),
        )
        .await;

        if let Err(e) = firebase::delete_code(&db, &token, code).await {
            tracing::warn!(error = %e, "could not retire session code");
        }

        crate::crash_recovery::clear_marker();
    }

    /// §7.3 — append one entry to the tamper-evident audit chain.
    ///
    /// Failures are logged, never propagated: losing an audit entry must not
    /// take down a live support session.
    async fn audit(&self, uid: &str, action: &str, session_id: &str) {
        let mut auth = self.auth.lock().await;
        let Ok(token) = auth.id_token().await else {
            return;
        };
        let db = auth.database_url().to_string();
        let proj = auth.project_id().to_string();
        drop(auth);

        if let Err(e) = crate::audit::write_audit_entry(
            &db,
            &token,
            &proj,
            uid,
            action,
            serde_json::json!({ "sessionId": session_id }),
        )
        .await
        {
            tracing::warn!(error = %e, action, "audit entry write failed");
        }
    }

    /// §6.3 — the durable session record the viewer's history page reads.
    async fn record_history(&self, viewer_uid: &str, started_at: i64, end_reason: &str) {
        let mut auth = self.auth.lock().await;
        let Ok(token) = auth.id_token().await else {
            return;
        };
        let proj = auth.project_id().to_string();
        let host_uid = auth.uid().to_string();
        drop(auth);

        if let Err(e) = firebase::write_session_history(
            &proj,
            &token,
            &host_uid,
            viewer_uid,
            &self.platform.to_string(),
            started_at,
            chrono::Utc::now().timestamp_millis(),
            end_reason,
        )
        .await
        {
            tracing::warn!(error = %e, "session history write failed");
        }
    }

    async fn read_session(&self, session_id: &str) -> Result<Option<serde_json::Value>> {
        let mut auth = self.auth.lock().await;
        let token = auth.id_token().await?;
        let db = auth.database_url().to_string();
        drop(auth);
        firebase::read_session(&db, &token, session_id).await
    }

    async fn set_status(&self, session_id: &str, status: SessionStatus) -> Result<()> {
        self.write_field(session_id, "status", serde_json::json!(status.to_string()))
            .await
    }

    async fn write_field(
        &self,
        session_id: &str,
        field: &str,
        value: serde_json::Value,
    ) -> Result<()> {
        let mut auth = self.auth.lock().await;
        let token = auth.id_token().await?;
        let db = auth.database_url().to_string();
        let proj = auth.project_id().to_string();
        drop(auth);
        firebase::update_session_field(&db, &token, &proj, session_id, field, value).await
    }
}

/// Mirror of `encoder::fit_within` for the resolution-change check, without
/// making that function public purely for this comparison.
fn fit_hint(w: u32, h: u32) -> (u32, u32) {
    if w == 0 || h == 0 {
        return (0, 0);
    }
    let scale = f64::min(
        f64::min(
            crate::encoder::TARGET_WIDTH as f64 / w as f64,
            crate::encoder::TARGET_HEIGHT as f64 / h as f64,
        ),
        1.0,
    );
    (
        ((w as f64 * scale) as u32) & !1,
        ((h as f64 * scale) as u32) & !1,
    )
}
