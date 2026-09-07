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

**Protocol versioning** is wired end-to-end (§6.1): the viewer writes
`protocolVersion` + `capabilities` with its claim on `REQUESTED`
(`app/session/page.tsx`), and the host reads them in the same poll that
verifies the viewer's token (`signaling.rs` → `check_protocol_compatibility`,
`negotiated_capabilities`), so a MAJOR mismatch is refused before the
Allow/Deny dialog appears.

A mismatch is reported as `status: "denied"` **plus** `denyReason:
"incompatible_version"`, not as its own status value — `status` has a
hard-coded enum in the RTDB `.validate`, and those rules are hand-published,
so a new status value would be rejected by the live ruleset and hang the
session. The viewer branches on `denyReason` to say "Update needed" instead
of "the host denied you". See `docs/protocol-versions.md`.

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

**Two palettes, deliberately**, and knowing which one you are in matters:

- *App chrome* (`/dashboard`, `/settings`, `/session`, `/download`,
  `/verify-2fa`) uses `viewer/tailwind.config.ts` — the single source of
  truth for colors/spacing/radii/type scale, accent `#ef443b`.
- *Marketing + auth* (`app/page.tsx`, `components/landing/*`,
  `components/auth/AuthScreen.tsx`, which `/login` and `/signup` both wrap)
  uses `viewer/DESIGN.md` — canvas `#050506`, sage accent `#8FBE8E` — written
  as literal hex, not tokens.

An ESLint rule (`no-restricted-syntax` in `eslint.config.mjs`) flags raw hex.
The marketing surface does not trip it, and there is **no exemption in the
config** — the rule's selector matches a literal that is *entirely* a hex
value, and that surface writes its colors inside Tailwind arbitrary-value
classes (`bg-[#8fbe8e]`), which are longer strings. Don't go looking for an
override that isn't there, and don't assume a hex in a class string was
reviewed. Where a literal genuinely cannot be a token — Clerk's `appearance`
API, `qrcode`'s render options, Next's `themeColor` metadata — the disable is
inline and carries its reason.

`npm run lint` is expected to report exactly **four** warnings, all
`react-hooks/set-state-in-effect`, all legitimate sync-on-mount effects; the
rationale is in `eslint.config.mjs`. Anything beyond those four is new.

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
- **WebAuthn now verifies server-side** (fixed 2026-09-05). It previously
  checked only that the returned credential id was in a list the caller
  supplied — a public identifier — so the private key was never exercised.
  `/api/webauthn/{options,verify}` hold the challenge and public keys and
  check signature, challenge, origin, rpID and an advancing counter.
  `lib/webauthn.ts` is now browser ceremony only.
- **TOTP is now encrypted with a server-held key** (fixed 2026-09-05). The
  PBKDF2 password used to be the uid, which is also the document path the
  ciphertext sits at, so a Firestore read yielded both. The key is now
  HKDF-derived from `TOTP_MASTER_KEY`, which never leaves the server, and
  `/api/totp/{setup,activate,verify}` do the crypto — the plaintext secret no
  longer exists in a page context after enrolment. **`TOTP_MASTER_KEY` must be
  set** (`openssl rand -base64 32`); `/api/totp/*` fails closed with 503 until
  it is, and changing it makes stored secrets undecryptable.
- **2FA is now enforced server-side** (fixed 2026-09-05). `/verify-2fa` used
  to set a module-level boolean in the browser and navigate on; the
  middleware only checked for a Clerk session, so requesting `/dashboard`
  directly skipped the page entirely. Proof is now a signed HttpOnly cookie
  issued by `/api/totp/verify` and `/api/webauthn/verify`, checked in
  `proxy.ts`. Whether 2FA is *enabled* rides on Clerk `publicMetadata`
  because middleware is edge runtime and cannot reach firebase-admin;
  `/verify-2fa`, `/settings` and the 2FA API routes are exempt so a user
  without a factor is never locked out of the page that manages factors.
- **The `Deploy Firebase Rules` CI job still fails on every `main` push**,
  by design: it has no `FIREBASE_SERVICE_ACCOUNT`/`FIREBASE_TOKEN` secret,
  and the workflow chooses to fail rather than report a green check for a
  deploy that did nothing. Its `validate` job — which compiles and exercises
  both rulesets against the emulators — does pass, and that is the one to
  watch. The rules currently live were published through the console, so CI
  is not yet the thing keeping them in sync with `firebase/`.

  (Whether the `FIREBASE_PROJECT_ID` *variable* is set is disputed between
  notes — one observation on 2026-09-01 found it set to `duxo-967f0`. Check
  `/actions/variables` before repeating either claim.)
- **No host-agent release has been published** — the download page's
  `releases/latest` link currently has nothing to resolve to.
- **TURN is unconfigured.** `.env.local` has no `NEXT_PUBLIC_METERED_TURN_*`
  values, so `/api/health` reports `turnConfigured: false`. Sessions still
  work peer-to-peer and fail on roughly 10–15% of networks — and they fail
  for the *remote* person, which is what makes it hard to notice. Needs a
  Metered.ca account; verify with `npm run check:turn`.

## Verified on 2026-09-07 (re-run these rather than trusting the list)

The whole pipeline was reproduced on the **pinned Node 20**, not just local
Node 24 — the two disagree, and a suite can pass here and fail CI on that
alone:

| Check | Result |
|---|---|
| `npm run type-check` | clean |
| `npm run lint` | 0 errors, 4 warnings (all documented, see above) |
| `npm run test:run` | 148 passed |
| `npm run test:rules` | 58 passed (needs a JRE — see below) |
| `npm run test:e2e` | 13 passed (uses the real Clerk key in `.env.local`) |
| `npm run build` ×2 | both CI variants, including the no-Firebase-credentials one |
| `npm run check:backend` | three greens |
| `cargo fmt --check` | clean |

The emulators need Java, which is not installed and needs no sudo to get: pull
Temurin 21 from
`https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jre/hotspot/normal/eclipse`,
extract it to the scratchpad, and set `JAVA_HOME`/`PATH`.

**The host agent still cannot be built locally** — `libwebkit2gtk-4.1-dev`,
`libvpx-dev`, `libsoup-3.0-dev` and `pkg-config` are all missing and
installing them needs a password. CI is the only place it compiles; push to
`feat/**` or `fix/**` and read the run. `cargo fmt --check` and `rustfmt` do
work locally and are worth running first, since CI gates on
`cargo fmt -- --check` and `cargo clippy --all-targets -- -D warnings`.

## Conventions (from CONTRIBUTING.md)

- **Conventional commits**: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`,
  `test:`, `security:`.
- Trunk-based, short-lived branches; CI gates `main`.
- Semver release tags (`v0.1.0`); the in-app updater compares against these.
