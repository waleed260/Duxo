# Duxo — Remote access, built in the open.

Zero-budget, end-to-end encrypted remote desktop for **Windows** and **Linux**.
Open source (MIT), WebRTC-based, no telemetry, no credit card required.

## What it does

Web-based viewer (browser) + portable host agent (.exe / .AppImage).
Full remote control on Windows and Linux X11. Wayland = view-only in MVP.

| Platform | Screen | Input | Status |
|---|---|---|---|
| Windows | DXGI Desktop Duplication | SendInput (enigo) | Full |
| Linux X11 | XShm / XGetImage | XTest (enigo) | Full |
| Linux Wayland | xdg-desktop-portal + PipeWire | Not in MVP | View-only |

## Quick start

### Prerequisites
- Node.js 18+ and npm
- Rust stable (for host agent builds)
- Firebase project with Auth + RTDB + Firestore enabled
- Metered.ca account (free TURN server)

### Viewer (Next.js)

```bash
cd viewer
cp .env.example .env.local   # Fill in your Firebase credentials
npm install
npm run dev                  # → http://localhost:3000
```

### Host agent (Tauri + Rust)

```bash
cd host-agent/src-tauri
cargo build --release
```

## Architecture

```
VIEWER                     WebRTC P2P                    HOST AGENT
 (Browser)      <──────────────────────────────────►   (Tauri/Rust)
 Next.js /          STUN + Metered TURN                    Windows:
 Vercel             + Oracle Coturn fallback (Path B)       .exe
                     │                                     Linux:
                     │                                     AppImage
                     └────────── Firebase RTDB ────────────┘
                        Auth / RTDB / Firestore
```

## Cost paths

| Path | Card? | Notes |
|---|---|---|
| **Path A** (Zero Card) | No | Metered TURN + STUN-only fallback. Client-side code expiry. |
| **Path B** (Card On File) | Yes (identity only) | Oracle Coturn fallback + Cloud Functions. Blaze plan. No charges within free tiers. |

## Documentation

- [Architecture](docs/architecture.md) — technical deep-dive
- [Data Schema](docs/data-schema.md) — RTDB + Firestore structure
- [Protocol Versions](docs/protocol-versions.md) — compatibility matrix
- [SECURITY.md](SECURITY.md) — security model, reporting
- [CONTRIBUTING.md](CONTRIBUTING.md) — conventions, workflow

## Roadmap (§0.10 — 16 weeks, 1 person)

| Phase | Weeks | Deliverable |
|---|---|---|
| 1 | 1–2 | Viewer shell + auth + landing + download page |
| 2 | 3–5 | Host agent + code system + Allow/Deny popup |
| 2.5 | 6 | Security hardening + TURN fallback |
| 3 | 7–11 | WebRTC video pipe (capture → view) |
| 4 | 12–15 | Remote control + clipboard + file transfer |
| 5 | post-MVP | Wayland input, macOS, mobile, EV signing |

## License

MIT — see [LICENSE](LICENSE).
