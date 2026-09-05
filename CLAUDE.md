# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Duxo is an open-source (MIT), end-to-end encrypted remote desktop: a Next.js
**viewer** (browser) pairs with a native **host agent** (Tauri v2 + Rust) over
WebRTC. Video/input travel peer-to-peer; Firebase is used only for
auth/signaling/durable records, never for media.

```
VIEWER (Next.js, unhosted)<── WebRTC P2P ──>  HOST AGENT (Tauri/Rust)
        │        STUN + Metered TURN                  Windows .exe
        │        + Oracle Coturn fallback              Linux .tar.gz
        └──────────── Firebase RTDB ──────────────────┘
                (Auth / RTDB signaling / Firestore)
```

Two independent projects live in this repo: `viewer/` (npm) and
`host-agent/src-tauri/` (cargo). There is no shared build step between them.

## Commands

### Viewer (`cd viewer`)

```bash
npm run dev                 # http://localhost:3000
npm run build                # production build (also type-checks)
npm run lint                  # ESLint
npm run type-check            # tsc --noEmit
npm test                      # vitest, watch mode
npm run test:run              # vitest, single run
npx vitest run path/to.test.ts        # a single test file
npx vitest run -t "test name"         # a single test by name
npm run test:e2e              # full Playwright suite
npx playwright test e2e/landing.spec.ts --project=chromium   # one spec
npm run check:turn            # verify TURN credentials in .env.local actually relay
npm run check:backend         # probe whether Firebase RTDB/Firestore/Auth are enabled
npm run check:deploy -- <url> # headless-browser smoke test against a live deployment
npm run test:rules            # Firestore/RTDB security-rules tests (spins up an emulator itself)
```

Node version is pinned in `viewer/.nvmrc` (currently 20) — CI reads it, and
`package-lock.json` is only valid for the npm that generated it, so regenerate
it on the pinned major or `npm ci` fails under CI naming unrelated packages.
Local Node may well be newer; a suite can pass locally and fail CI on that
difference alone, so reproduce against the pinned major before believing a
green local run.

`npm run test:run` (via `vitest.config.ts`) excludes `e2e/**` and
`rules-tests/**` by default — they need a Clerk test instance and an RTDB
emulator respectively, and are run separately (`test:e2e`, `test:rules`).

### Host agent (`cd host-agent/src-tauri`)

```bash
cargo build --release
cargo test                       # unit + integration tests
cargo test test_name              # a single test
cargo clippy -- -D warnings
cargo fmt
cargo tauri dev                   # run with hot reload; .env overrides baked-in config
```

Linux builds need system packages (`pkg-config`, `libwebkit2gtk-4.1-dev`,
`libvpx-dev`, etc. — see README's "Linux build dependencies" for the full
list); a missing `libvpx-dev` is a hard build failure because webrtc-rs is
transport-only and does no video encoding — VP8 encoding is this project's
own code (`src/encoder.rs`).

## Architecture

**Session lifecycle** (`docs/architecture.md` §1.1):
`CREATED → WAITING → REQUESTED → ALLOWED → CONNECTING → ACTIVE → ENDED`
(or `→ DENIED`/`→ CLOSED`; any state times out to `EXPIRED` after 24h).
The host, not the viewer, is authoritative for `ACTIVE` — it confirms from
its own RTDB read before opening the input gate, and re-checks that gate on
every input message.

**Device pairing** (prerequisite to any session): the host agent has no
Clerk session and must never embed a credential that can mint one. Pairing
writes an unauthenticated `pairings/{6-char-code}` node from the host; the
signed-in viewer submits that code at `/link-device`; the server mints a
Firebase custom token for *its own caller's uid* (from the Clerk session,
never from the request body) and writes it back; the host exchanges it for a
refresh token stored in the OS keychain (Windows Credential Manager / Linux
Secret Service via `keyring`), single-use, 10-minute TTL. This is why
`hostId == auth.uid` holds in the security rules.

**Who offers/answers**: the *viewer* creates the WebRTC offer and the *host*
answers, deliberately backwards from the usual caller-offers convention —
the host is the peer that knows what it can decode.

**Capture/encode threading** (host agent): `scrap::Capturer` is neither
`Send` nor `Sync`, and encoding costs 10-20ms of CPU, so capture+encode run
on a dedicated OS thread and hand frames to the async/WebRTC side over a
depth-2 channel — intentionally shallow, so a slow network drops frames
instead of queueing stale screen state.

**Protocol versioning**: capability negotiation is implemented host-side
(`session::check_protocol_compatibility`, `negotiated_capabilities`) but not
yet wired end-to-end — the viewer doesn't send a protocol declaration on
`REQUESTED` yet, so both sides are just pinned to one version.

**Viewer auth vs. host auth are different systems**: the viewer uses
Clerk, exchanged for a Firebase custom token via `/api/firebase-token`
(kept in memory only, never persisted). The host has no Clerk session at
all — only the keychain-stored Firebase refresh token from pairing. Don't
assume a Clerk session exists anywhere in host-agent code, or that Firebase
identity exists anywhere in viewer code without that exchange.

**Data layer split**: Firebase RTDB is signaling only (offer/answer/ICE,
ephemeral); Firestore holds durable records (session history, profiles).
See `docs/data-schema.md` for the schema and any deliberate deviations from
the original design doc.

**Build-time vs. runtime config divergence (host agent)**: a *released*
binary ships with nothing beside it — no `.env` travels with it — so the
four `DUXO_*` Firebase/URL values are baked in at *compile* time via
repository variables in `release.yml`, safe because they're the same public
web-app values the viewer already ships client-side. `cargo tauri dev` still
lets a local `.env` override the compiled-in defaults for local iteration.

**Next.js viewer is server-rendered, not static** — the Clerk→Firebase token
exchange and device pairing are API routes needing a server runtime, which
is why it cannot be exported statically. It has no hosting target at
present — Railway was removed on 2026-09-05 — so any host must provide a Node
server runtime, not a static bucket.

**Design tokens are enforced, not just conventional**: `viewer/tailwind.config.ts`
is the single source of truth for colors/spacing/radii/type scale; an ESLint
rule (`no-restricted-syntax` in `eslint.config.mjs`) flags raw hex values
used outside that file. The landing page (`app/page.tsx`) is a deliberate,
documented exception — it's an intentionally separate light/monochrome
surface isolated from the shared dark app chrome, so it uses its own literal
hex values rather than the app's dark-theme tokens.

**Path aliases**: `@/*` → `viewer/` root, `@shared/*` → `viewer/shared/`
(currently just `types.ts`). Both `tsconfig.json` and `vitest.config.ts`
must stay in sync on `@shared` — it used to point at a stale duplicate file,
which caused vitest and `tsc`/`next build` to type-check against two
different copies of a runtime protocol-version constant.

**`measured/`** at the repo root is a separate, standalone Vite+React
scaffold (own `package.json`, own dev server) used as a prototyping
sandbox — not part of the viewer's build. Components proven out there
(e.g. `MobileMenu.tsx`, `useBodyLock.ts`) get ported into
`viewer/components/measured/` by hand; there's no automated sync between
the two.

## Current known gaps (as of the last README update)

These affect what you can actually verify, not just what's coded:

- ~~No Firebase backend is provisioned~~ — **done 2026-09-05.** All three
  services exist on `duxo-967f0` and `npm run check:backend` reports three
  greens: Realtime Database (us-central1), Cloud Firestore (nam5, Standard
  edition, `(default)`), and Authentication with Email/Password enabled.
  Both rulesets are published from `firebase/`, verified live: an anonymous
  GET of `pairings/<code>/customToken` returns 200/null while its parent
  node and `sessions` both return 401, which is exactly the narrow read
  window §0.7 describes and is not what Firebase's default rules do.

  Note the two locations are permanent-ish: Firestore's `nam5` cannot be
  changed at all, and moving RTDB means a new instance and a new
  `NEXT_PUBLIC_FIREBASE_DATABASE_URL`.
- **The viewer is not hosted anywhere.** Railway was removed on 2026-09-05
  (`git log -- viewer/railway.json` has the config). `npm run check:deploy`
  takes a URL and is host-agnostic, so it still works against whatever the
  next target is; there is just nothing to point it at.
- **The `Deploy Firebase Rules` CI job still fails on every `main` push**,
  by design: it has no `FIREBASE_PROJECT_ID` repository variable and no
  `FIREBASE_SERVICE_ACCOUNT`/`FIREBASE_TOKEN` secret, and the workflow
  chooses to fail rather than report a green check for a deploy that did
  nothing. Its `validate` job — which compiles and exercises both rulesets
  against the emulators — does pass, and that is the one to watch. The
  rules currently live were published through the console, so CI is not yet
  the thing keeping them in sync with `firebase/`.
- **No host-agent release has been published** — the download page's
  `releases/latest` link currently has nothing to resolve to.

## Conventions (from CONTRIBUTING.md)

- **Conventional commits**: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`,
  `test:`, `security:`.
- Trunk-based, short-lived branches; CI gates `main`.
- Semver release tags (`v0.1.0`); the in-app updater compares against these.
