# Deploying Duxo — the linear runbook

The code is complete and CI is green. Everything below authenticates as
**you** (the project owner); nothing in this repo holds a credential that can
do any of it. The README explains *why* each step exists — this file is just
the ordered list of commands.

Fixed identifiers this runbook uses:

| | |
|---|---|
| Firebase project | `duxo-967f0` |
| RTDB region | `us-central1` (default instance host, `duxo-967f0-default-rtdb.firebaseio.com`) |
| Firestore location | `nam5` — **permanent once set** |
| Railway project | `cb502db9-7a51-4645-aac0-e64eea64499f` |
| Railway service | `896c1a71-e072-40c1-b2cd-d4ae38a39a65` (env `production`) |
| GitHub repo | `waleed260/Duxo` |

Check progress at any point:

```bash
./scripts/provision.sh check      # probes the live Firebase project
```

---

## 1. Firebase — Realtime Database + Firestore + Auth

```bash
./scripts/provision.sh firebase
```

This runs `firebase login` (opens a browser), then:

- `firebase database:instances:create duxo-967f0-default-rtdb --location us-central1`
- `firebase firestore:databases:create "(default)" --location nam5`

Then do the one part with no CLI, in the console:

> <https://console.firebase.google.com/project/duxo-967f0/authentication/providers>
> → **Get started** → enable **Email/Password**

`signInWithCustomToken` (device pairing) fails with `CONFIGURATION_NOT_FOUND`
until Auth exists — and it fails on the *host*, after the web app has already
reported the pairing as successful.

**Verify:**

```bash
./scripts/provision.sh check
# want: 3 of 3 services present
```

---

## 2. Security rules

```bash
./scripts/provision.sh rules
```

Runs `firebase deploy --only database,firestore:rules,firestore:indexes`.
A new project ships with open defaults until this runs. A session cannot
reach `REQUESTED` without the viewer-claim clause in `database.rules.json`,
so an undeployed ruleset looks like "viewer enters a valid code, then hangs".

---

## 3. GitHub secret so CI keeps rules applied

`deploy-rules.yml` fails on every push until this is set — by design, so a
tightened rule can't be merged and silently left undeployed.

```bash
# Firebase console → Project settings → Service accounts → Generate new private key
gh secret set FIREBASE_SERVICE_ACCOUNT --repo waleed260/Duxo < <(base64 -w0 ~/Downloads/duxo-967f0-*.json)
```

Web UI fallback: <https://github.com/waleed260/Duxo/settings/secrets/actions/new>
(name `FIREBASE_SERVICE_ACCOUNT`, value = base64 of the whole JSON key file).

---

## 4. Railway — generate the public domain

```bash
./scripts/provision.sh railway
```

Runs `railway login` (browser), links the project/service/environment above,
then `railway domain`. The hostname it prints is the origin every later step
needs. Do **not** substitute `duxo.app` or `duxo.dev` — the first is an
unrelated product with the same name, the second doesn't resolve.

---

## 5. Metered.ca TURN credentials

Free, 50 GB/month, no card: <https://www.metered.ca/tools/openrelay/>
Without TURN, ~10–15 % of sessions fail — and they fail for the *remote*
caller, not for you.

Put the three values in `viewer/.env.local` for local dev:

```
NEXT_PUBLIC_METERED_TURN_URLS=...
NEXT_PUBLIC_METERED_TURN_USERNAME=...
NEXT_PUBLIC_METERED_TURN_CREDENTIAL=...
```

Then verify them (gathers ICE candidates with `iceTransportPolicy: "relay"`):

```bash
cd viewer && npm run check:turn
```

---

## 6. Railway environment variables

Setting any of these triggers a redeploy, which is required — the
`NEXT_PUBLIC_*` values are inlined at build time, so a restart wouldn't pick
them up.

```bash
railway variables \
  --set NEXT_PUBLIC_SITE_URL=https://<host-from-step-4> \
  --set NEXT_PUBLIC_METERED_TURN_URLS=<urls> \
  --set NEXT_PUBLIC_METERED_TURN_USERNAME=<user> \
  --set NEXT_PUBLIC_METERED_TURN_CREDENTIAL=<pass>
```

`/api/health` on the deployed origin lists anything still missing. Required:
`CLERK_SECRET_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`,
`FIREBASE_PRIVATE_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
`NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`. TURN is
reported separately (degrades, doesn't break).

**Verify the whole deployment** (headless browser against the origin):

```bash
cd viewer && npm run check:deploy -- https://<host-from-step-4>
```

---

## 7. Host-agent release configuration

`release.yml` refuses to publish until all four repository **variables** are
set (they're baked into the binary at compile time — a downloaded release
carries no `.env`). Three are already set; `DUXO_WEB_APP_URL` is not.

```bash
gh variable set DUXO_WEB_APP_URL --repo waleed260/Duxo --body "https://<host-from-step-4>"
```

Optional, for signed in-app updates:

```bash
./scripts/updater-keygen.sh          # prints a keypair; public half is already in tauri.conf.json
gh secret set UPDATER_SIGNING_KEY --repo waleed260/Duxo < private-key-contents
gh secret set UPDATER_SIGNING_KEY_PASSWORD --repo waleed260/Duxo --body "<passphrase>"
```

Then cut the release: GitHub → Actions → **Release Host Agent** → Run workflow
→ version `v0.1.0`. It builds and uploads the Linux `.tar.gz` and Windows
`.zip`.

---

## 8. One real end-to-end session

Needs a Windows machine and a Linux X11 machine (Wayland is view-only in the
MVP). On each:

```bash
# Linux build deps first — see README "Linux build dependencies"
cd host-agent/src-tauri && cargo build --release
```

Then:

1. Host tray → **Link this device…** → shows a 6-char code
2. Viewer `/link-device` → enter it → agent stores a refresh token in the OS keychain
3. Host tray → **Start a session** → shows an 8-digit code
4. Viewer dashboard → enter the code
5. Host shows a native dialog with the viewer's verified email → **Allow**
6. Confirm: live video in the viewer, and mouse/keyboard control on Windows
   and Linux X11

That last step is the first time the full path (pair → code → connect →
approve → video + input) has ever run. Until it passes on real hardware,
"CI is green" means "it compiles", not "it works".
