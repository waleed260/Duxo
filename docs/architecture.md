# Duxo Architecture

Refer to the [Duxo Master Plan](../Duxo_Master_Plan.pdf) for the complete
implementation guide. This document provides a high-level summary.

## System Overview

```
VIEWER                     WebRTC P2P                    HOST AGENT
(Browser)      <──────────────────────────────────►   (Tauri/Rust)
Next.js /          STUN + Metered TURN                    Windows: .exe
Vercel             + Oracle Coturn fallback                Linux: AppImage
                   │
                   └────────── Firebase RTDB ────────────┘
                      Auth / RTDB / Firestore
```

## Key Design Decisions

- **WebRTC P2P** — video/input never touches our infrastructure
- **Firebase RTDB** — signaling only (offer/answer/ICE candidates)
- **Firestore** — durable records (session history, user profiles)
- **Host agent** — native Tauri v2 app (Rust), portable .exe / .AppImage
- **Viewer** — Next.js 14 static export, deployed to GitHub Pages

## Session State Machine (§1.1)

```
CREATED → WAITING → REQUESTED → ALLOWED → CONNECTING → ACTIVE → ENDED
                              → DENIED → CLOSED
Any state → (24h timeout) → EXPIRED
```

## Stack

| Layer | Choice |
|---|---|
| Viewer UI | Next.js 14 + Tailwind CSS + shadcn/ui |
| Host Agent | Tauri v2 + Rust |
| Auth | Firebase Auth |
| Signaling | Firebase RTDB |
| Persistence | Firestore |
| Video | WebRTC (VP8/VP9) |
| Screen (Windows) | DXGI via `scrap` |
| Screen (Linux X11) | XShm via `scrap` |
| Input | `enigo` (SendInput / XTest) |
| STUN | Google public |
| TURN | Metered.ca (Path A) / Oracle Coturn (Path B) |

## Protocol Versioning (§6.1)

Every signaling message carries a `protocolVersion` field.
Capability flags negotiated down: host v1.0 + viewer v1.2 →
use common subset, not fail the session.

## Data Flow (§1.6)

1. Viewer logs in (Firebase Auth, JWT in memory)
2. Host creates session, writes code to RTDB
3. Viewer enters code → RTDB lookup → sessionId
4. Viewer writes viewerId + status=REQUESTED
5. Host verifies JWT locally → shows Allow/Deny popup
6. Host writes ALLOWED → viewer creates WebRTC offer
7. Host answers → ICE candidates exchanged → P2P established
8. Video flows from host → viewer; input flows viewer → host over data channel
