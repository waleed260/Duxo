# Duxo Architecture

A high-level summary of what is actually built. Where this differs from the
Master Plan, the difference is deliberate and noted — see `data-schema.md`
for the storage-layer deviations and the reasons for them.

## System Overview

```
VIEWER                     WebRTC P2P                    HOST AGENT
(Browser)      <──────────────────────────────────►   (Tauri/Rust)
Next.js /          STUN + Metered TURN                    Windows: .exe
Railway            + Oracle Coturn fallback                Linux: tar.gz
                   │
                   └────────── Firebase RTDB ────────────┘
                      Auth / RTDB / Firestore
```

## Key Design Decisions

- **WebRTC P2P** — video/input never touches our infrastructure
- **Firebase RTDB** — signaling only (offer/answer/ICE candidates)
- **Firestore** — durable records (session history, user profiles)
- **Host agent** — native Tauri v2 app (Rust), a single portable binary
  shipped as a Windows .zip / Linux .tar.gz
- **Viewer** — Next.js 16, server-rendered. *Not* a static export: the
  Clerk→Firebase token exchange and device pairing are API routes and need a
  server runtime.
- **Video encoding is ours.** webrtc-rs is transport only and does no
  encoding, so the host agent compresses VP8 itself via libvpx
  (`host-agent/src-tauri/src/encoder.rs`). Raw pixels written to a track
  decode to nothing.
- **Capture owns a thread.** `scrap::Capturer` is neither `Send` nor `Sync`,
  and encoding 720p costs 10-20ms of CPU, so capture and encode run on a
  dedicated OS thread and hand encoded frames to the async side over a
  depth-2 channel — shallow on purpose, so a slow network drops frames and
  stays current instead of queueing stale screen state.

## Session State Machine (§1.1)

```
CREATED → WAITING → REQUESTED → ALLOWED → CONNECTING → ACTIVE → ENDED
                              → DENIED → CLOSED
Any state → (24h timeout) → EXPIRED
```

## Stack

| Layer | Choice |
|---|---|
| Viewer UI | Next.js 16 + Tailwind CSS + shadcn/ui |
| Host Agent | Tauri v2 + Rust |
| Viewer auth | Clerk → Firebase custom token (`/api/firebase-token`) |
| Host auth | Device pairing → Firebase refresh token in the OS keychain |
| Signaling | Firebase RTDB |
| Persistence | Firestore |
| Video | VP8 via libvpx (`vpx-encode`), carried by webrtc-rs |
| Screen (Windows) | DXGI via `scrap` |
| Screen (Linux X11) | XShm via `scrap` |
| Input | `enigo` (SendInput / XTest) |
| STUN | Google public |
| TURN | Metered.ca (Path A) / Oracle Coturn (Path B) — verify with `npm run check:turn` |
| Deploy | Railway (viewer), GitHub Releases (host agent) |

## Protocol Versioning (§6.1)

Designed and implemented on the host side (`session::check_protocol_compatibility`,
`negotiated_capabilities`): capability flags negotiate *down* to the common
subset rather than failing the session, so a host on v1.0 and a viewer on v1.2
still connect.

Not yet wired end to end — the viewer does not send a protocol declaration on
REQUESTED, so nothing calls the negotiation today. Both sides are pinned to one
version, which is correct while there is only one.

## Device pairing (prerequisite)

The host agent has no login screen and cannot have one: it holds no Clerk
session, and the Firebase key that mints credentials must never ship inside a
downloadable binary. A machine is therefore paired to an account once.

1. Host writes `pairings/{6-char-code}` unauthenticated — it has no
   credential yet, which is the point. Nothing secret travels that way.
2. The signed-in user enters the code at `/link-device`.
3. The server mints a Firebase custom token for **its caller's own uid**,
   taken from the Clerk session and never from the request body, and writes
   it back to the pairing node.
4. The host exchanges it for a refresh token, stores that in the OS keychain
   (§2.6), and deletes the pairing node. Single-use, ten-minute TTL.

Because the uid is the user's own, §10.2's `hostId == auth.uid` rule holds
unchanged.

## Data Flow (§1.6)

1. Viewer signs in with Clerk; `/api/firebase-token` exchanges that for a
   Firebase custom token, kept in memory only
2. Host creates session, writes code to RTDB
3. Viewer enters code → RTDB lookup → sessionId
4. Viewer writes viewerId + status=REQUESTED
5. Host verifies JWT locally → shows Allow/Deny popup
6. Host writes ALLOWED → viewer creates the WebRTC offer
7. Host **answers** (§1.6-B: the browser offers, because it is the peer that
   knows what it can decode) → ICE candidates trickle both ways → P2P
   established
8. Host confirms ACTIVE from its *own* RTDB read, never the viewer's claim,
   and only then opens the input gate
9. Video flows host → viewer; input flows viewer → host over the data
   channel, re-checking the gate on every message
