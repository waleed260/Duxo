# Duxo — Remote access, built in the open.

Zero-budget, end-to-end encrypted remote desktop for **Windows** and **Linux**.
Open source (MIT), WebRTC-based, no telemetry, no credit card required.

## What it does

Web-based viewer (browser) + portable host agent (Windows .zip / Linux .tar.gz,
each holding a single self-contained binary).
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

### Firebase project setup (§0.13 items 4–5)

> **The Firebase backend does not exist yet.** Three services are missing, each
> confirmed by a probe you can re-run yourself. Nothing in the product works
> until they exist — every session, code and pairing lives in these.
>
> ```bash
> cd viewer && npm run check:backend
> ```
>
> That runs all three probes below against the project in `.env.local`, names
> the console click each missing service needs, and exits non-zero while any
> of them is missing — so it doubles as the "did that actually take?" check
> after you enable them. It uses only public config values, no
> service-account key.
>
> | Service | Probe | Result |
> |---|---|---|
> | Realtime Database | `curl -s -o /dev/null -w '%{http_code}' https://duxo-967f0-default-rtdb.firebaseio.com/.json` | `404` — no instance. A database that exists but is locked answers `401`, so this is not a rules problem. Checked in `us-central1`, `europe-west1` and `asia-southeast1`. |
> | Cloud Firestore | `firestore.googleapis.com/v1/projects/<id>/databases` with a service-account token | `403` — "API has not been used in this project before" |
> | Authentication | `identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken` with a deliberately invalid token | `CONFIGURATION_NOT_FOUND`. An enabled project answers `INVALID_CUSTOM_TOKEN`, so this is the project, not the token. |
>
> **Auth matters more than it looks.** Device pairing mints a custom token
> server-side (which works — the Admin SDK signs it locally) and then the host
> exchanges it via `signInWithCustomToken`. That second half fails with
> `CONFIGURATION_NOT_FOUND` until Auth is enabled, so pairing breaks *after*
> the web app has reported success.
>
> **To fix**, in the [Firebase console](https://console.firebase.google.com/)
> for this project:
>
> 1. Build → **Realtime Database** → Create Database → `us-central1` → Locked mode
> 2. Build → **Firestore Database** → Create database → Locked mode
> 3. Build → **Authentication** → Get started → enable Email/Password
>
> Spark (free) covers all three, per §0.3. Then deploy the rules below —
> locked mode denies everything until you do.
>
> Set the `FIREBASE_PROJECT_ID` **repository variable** to the same project.
> The workflows had it hardcoded to `duxo-remote`, which is not the project the
> app is configured against.

### Security rules (do this before anything writes user data)

The rules in `firebase/` are the only thing separating one account's sessions
from another's, and they are **not** applied by deploying the viewer. Push to
`main` runs `.github/workflows/deploy-rules.yml`, or do it by hand:

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only database,firestore:rules,firestore:indexes \
  --project <your-project-id>
```

For the workflow to deploy anything, the repo needs one of two secrets:
`FIREBASE_SERVICE_ACCOUNT` (base64 of a service-account JSON key — the same
one `firestore-backup.yml` uses) or `FIREBASE_TOKEN`. **Neither is currently
set**, so the workflow will fail loudly rather than report a green check for a
deploy that did not happen.

Until this runs, the project is on whatever rules were last set in the
console — for a new project, Firebase's defaults, which are open. A session
also cannot reach `REQUESTED` without the viewer-claim clause in
`database.rules.json`, so an undeployed ruleset shows up as a viewer that
enters a valid code and then hangs.

### Railway environment

`GET /api/health` on the live deployment reports what is missing. As of the
last check the production instance is missing three variables — all server
secrets are set, so sign-in and the API routes work, but:

| Missing | Effect |
|---|---|
| `NEXT_PUBLIC_METERED_TURN_USERNAME` | §0.8 — sessions fail on restrictive networks (~10–15%), and they fail for the *remote* caller |
| `NEXT_PUBLIC_METERED_TURN_CREDENTIAL` | Same |

`NEXT_PUBLIC_FIREBASE_DATABASE_URL` is also unset, and that is fine:
`lib/firebase-client.ts` derives Firebase's default instance from the project
id, which is the correct host for a default-region database. Set it only if
the database lives in another region, where the derived
`<project>-default-rtdb.firebaseio.com` would point at the wrong place.

The `NEXT_PUBLIC_*` ones are inlined at build time, so Railway needs a
redeploy after setting them, not just a restart.

Railway health-checks `/api/health` on every deploy (`viewer/railway.json`),
so a build that comes up without its server secrets fails the deploy instead
of replacing a working instance with a broken one. That is why the endpoint
answers 503 rather than 200 when it is misconfigured — a missing TURN
credential stays 200, since §0.8 degrades rather than breaks and should not
block a release.

### Checking a deployment

The viewer runs on Railway (`viewer/railway.json` — Nixpacks build, `next start`).
A build passing says the code compiles; it says nothing about whether the
deployed instance has its environment set. To check a real deployment:

```bash
cd viewer
npm run check:deploy -- https://your-app.up.railway.app
```

It drives a headless browser against the origin and asserts the things that
only fail in a browser: that the app renders, that `/api/health` reports every
required variable present, that the API routes refuse an anonymous caller with
JSON rather than an HTML redirect, that `/dashboard` sends a signed-out
visitor to `/login`, and that nothing throws in the console. Non-zero exit on
failure, so it can gate a release.

`GET /api/health` on its own answers most of it — it names any missing
variables without returning their values, and answers 503 rather than 200 when
the deploy is misconfigured, so an uptime check cannot read it as healthy.

### Cutting a release (§7.1)

The download page points at `releases/latest`, and there are no releases yet,
so it currently lands on an empty page. Publishing one is a manual
`workflow_dispatch` on **Release Host Agent** with a version like `v0.1.0`; it
builds and uploads a Linux `.tar.gz` and a Windows `.zip`.

**It will refuse to run until the four `DUXO_*` repository variables are set**
(see [Host agent](#host-agent-tauri--rust) above). They are baked into the
binary, and they are the only configuration a downloaded release ever gets —
publishing without them ships an agent whose tray menu is greyed out on every
machine that installs it, which is worse than not publishing at all.

In-app updates additionally need the minisign key pair the updater verifies
against. `tauri.conf.json` already carries the public half, and
`scripts/updater-keygen.sh` generates a pair if you need a new one. Set:

| Secret | Needed for |
|---|---|
| `UPDATER_SIGNING_KEY` | The private key's *contents* (not a path). Without it the release still publishes and downloads, but no update manifest is written. |
| `UPDATER_SIGNING_KEY_PASSWORD` | Only if the key is passphrase-encrypted, which `updater-keygen.sh` produces by default. |

Without those, the workflow warns and skips the manifest rather than
publishing one it cannot sign: the updater plugin verifies every download
against the embedded public key, so a manifest with an empty signature does
not mean "unsigned build", it means every in-app update fails and tells the
user so. No manifest at all means the updater finds nothing and says nothing.

### Viewer (Next.js)

```bash
cd viewer
cp .env.example .env.local   # Fill in Firebase, Clerk and TURN values
npm install
npm run dev                  # → http://localhost:3000
```

Node 20, pinned in `viewer/.nvmrc`. CI and Railway's Nixpacks both read that
file, and `package-lock.json` is only valid for the npm that wrote it — a
lockfile generated on Node 24 fails `npm ci` under Node 20's npm 10, naming
packages nothing depends on directly. If you regenerate the lockfile, do it on
the pinned major.

`.github/workflows/viewer.yml` type-checks, lints, tests and builds on every
push touching `viewer/`. It builds twice: once with fake credentials, then
again with the Firebase ones removed entirely. The second is a regression
test, not a duplicate — `next build` evaluates every route module to collect
page data, so anything initialised at module scope runs at build time, and a
missing `FIREBASE_PRIVATE_KEY` used to fail the build rather than the request.
That is why `lib/firebase-admin.ts` builds its app on first use instead of at
import.

**The Playwright suite needs a Clerk test instance.** `viewer/e2e/` holds
thirteen specs — landing page, download page, static pages, and the
unauthenticated half of device pairing — and until now nothing ran them
anywhere. They cannot run on the fake credentials the build job uses: Clerk
resolves an instance from the publishable key, and a fake one makes
`clerkMiddleware` answer *every* route, public marketing pages included, with
Clerk's own `"Invalid host"` JSON instead of the page. Eleven of the thirteen
then fail for a reason that has nothing to do with the code under test. A valid
key never takes that path, so this is a property of a bogus key rather than a
defect.

Set two secrets to turn the job on, from a Clerk **test** instance:

| Secret | |
|---|---|
| `E2E_CLERK_PUBLISHABLE_KEY` | `pk_test_…` |
| `E2E_CLERK_SECRET_KEY` | `sk_test_…` |

Without them the job emits a warning naming both and skips, rather than failing
on every push — a permanently red required check teaches people to ignore CI.
Firebase stays fake in that job on purpose: these specs assert the shape of the
*unauthenticated* responses, and every one of those is decided before anything
reaches Firebase.

Locally, `npm run test:e2e` uses `.env.local`, so it needs no extra setup.

### Host agent (Tauri + Rust)

```bash
cd host-agent/src-tauri
cp .env.example .env         # Same Firebase project as the viewer
cargo build --release
```

**A released binary does not read that `.env`.** `release.yml` packages the
executable and nothing else, so nothing travels beside it and there is nowhere
for a user to put configuration. The four variables below are therefore read at
*compile* time as well and baked into the binary — safe, because they are the
same public Firebase web-app values the viewer already ships in its client
bundle, and the host's only real credential is the refresh token in the OS
keychain (§2.6).

Set them as repository **variables** (not secrets), and **Release Host Agent**
passes them to `cargo build`:

| Variable | Notes |
|---|---|
| `DUXO_FIREBASE_API_KEY` | Public web API key |
| `DUXO_FIREBASE_DATABASE_URL` | The RTDB instance all signaling lives in |
| `DUXO_FIREBASE_PROJECT_ID` | Must match the viewer's project |
| `DUXO_WEB_APP_URL` | Where pairing sends the user — the *deployed* viewer origin, since the agent shows them `<url>/link-device` |

The release refuses to publish with any of them unset. That is deliberate: an
unconfigured agent starts with its whole tray menu greyed out and a "Not
configured" line in it, which is the honest outcome, but it is not something to
hand to a user who just downloaded a release.

A runtime value always beats the baked-in one, so `.env` still overrides
everything for `cargo tauri dev`. A blank line in `.env` is not an override —
an empty value falls through to the compiled-in default rather than clearing it.

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
                     │                                     tar.gz
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
