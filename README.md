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
- Rust stable
- A Firebase project with Auth, Realtime Database and Firestore enabled
- A Clerk application (free tier) for viewer sign-in
- A [Metered.ca](https://www.metered.ca/tools/openrelay/) account for TURN
  (free, 50GB/month, no card). Without TURN, sessions on restrictive networks
  — roughly 10–15% of them — cannot connect at all, and they fail for the
  *remote* person rather than for you. The no-signup `openrelay.metered.ca`
  credentials that circulate online no longer resolve, so an account is
  genuinely required.

  Once the values are in `viewer/.env.local`, check them:

  ```bash
  cd viewer && npm run check:turn
  ```

  This gathers ICE candidates with `iceTransportPolicy: "relay"`, so the
  browser refuses every non-relay candidate — anything it finds had to come
  through TURN. Bad credentials, a blocked port and an expired tier all fail
  identically at runtime; this tells them apart.

**Linux build dependencies.** The host agent will not compile without these,
and the failure (`pkg-config not found`, `gdk-sys`, `env-libvpx-sys`) points at
a dependency rather than at what is missing:

```bash
sudo apt install -y \
  pkg-config build-essential curl wget file \
  libwebkit2gtk-4.1-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev \
  libxdo-dev libxcb1-dev libxcb-shm0-dev libxcb-randr0-dev \
  libvpx-dev libdbus-1-dev clang libclang-dev
```

`libvpx` is a hard requirement, not an optimisation: webrtc-rs is transport
only and does no video encoding, so VP8 compression is the host agent's own
job (`src/encoder.rs`).

### Viewer (Next.js)

```bash
cd viewer
cp .env.example .env.local   # Fill in Firebase, Clerk and TURN values
npm install
npm run dev                  # → http://localhost:3000
```

### Host agent (Tauri + Rust)

```bash
cd host-agent/src-tauri
cp .env.example .env         # Same Firebase project as the viewer
cargo build --release
```

### Running a session

The host agent has no login screen of its own. It cannot: the viewer signs in
through Clerk, and the Firebase key that mints credentials must never ship
inside a downloadable binary. So the machine being shared is *paired* to an
account once, the way a TV app is:

1. **Link the device (once per machine).** Launch the host agent and pick
   **Link this device…** from the tray menu. It shows a six-character code.
2. Sign in to the viewer, go to **/link-device**, and enter that code. The
   server mints a Firebase credential for *your own* account and hands it to
   the waiting agent, which stores the refresh token in the OS keychain
   (Windows Credential Manager / Linux Secret Service). The device is now
   linked until you unlink it.
3. **Start a session.** Tray menu → **Start a session**. The agent shows an
   8-digit code, grouped as `XXXX XXXX` so it survives being read aloud.
4. **Connect.** On the viewer's dashboard, enter that code.
5. **Approve.** The host machine shows a native dialog with the viewer's
   *verified* email — taken from the signature-checked Firebase token, not
   from anything the viewer wrote. Nothing is shared until someone at the
   host clicks Allow. A timeout, a dismissed dialog, or a closed window all
   count as Deny.

> On GNOME, the tray icon needs the AppIndicator extension. Without it the
> agent runs but shows no icon, which looks like it failed to launch.

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
