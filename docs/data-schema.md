# Duxo — Data Schema

Source of truth for the durable Firestore records (§6.3) and the live RTDB
signaling node (§0.6). RTDB and Firestore serve different roles and **must
not** be mixed.

## Rule of thumb

| Store | Role | Frequency |
|---|---|---|
| **RTDB** (`sessions/`, `codes/`, `pairings/`, `auditLog/`, `rateLimit/`) | Live signaling: offer/answer, ICE candidates, status; plus device pairing and the audit chain | High-frequency, ephemeral |
| **Firestore** (`users/`, `devices/`, `sessionHistory/`) | Durable records: profiles, device registry, history | Low-frequency, persistent |

> Never write per-frame or per-input-event data into Firestore. It blows the
> 20K writes/day quota almost immediately. Per §6.3 — this is a common bug
> class in exactly this kind of app.

## RTDB — live session node (§0.6)

```
sessions/{sessionId}
  hostId:           string   (Firebase UID)
  hostPlatform:     "windows" | "linux-x11" | "linux-wayland"
  viewerId:         string | null
  status:           SessionStatus  (see shared/types.ts — explicit enum)
  offer:            string | null  (≤10KB SDP)
  answer:           string | null  (≤10KB SDP)
  hostCandidates:   { "0".."99": candidate-string }  (batched, max 10/write)
  viewerCandidates: { "0".."99": candidate-string }
  createdAt:        number (ms epoch)
  updatedAt:        number (ms epoch)

codes/{8-digit-code}: sessionId   (100M combinations, 24h expiry)
rateLimit/{ipHash}:   { count, lastAttempt }   (5/min/IP, §0.7)
```

The session node also carries `viewerToken` — the viewer's Firebase ID token,
written once when it claims the session and read once by the host, which
verifies the signature locally against Google's public certs (§2.5). The host
never trusts `viewerId` on its own; the email shown in the Allow/Deny dialog
comes from the verified token's claims.

## RTDB — device pairing

Not in the original plan, and required: the host agent has no way to sign in
on its own. It has no Clerk session, and the Firebase service-account key that
mints custom tokens must never ship inside a downloadable binary. So a machine
is paired to an account once, and the pairing node is the handoff point.

```
pairings/{6-char-code}
  deviceName:  string   (hostname, shown to the user before they approve)
  platform:    "windows" | "linux-x11" | "linux-wayland"
  appVersion:  string
  createdAt:   number (ms epoch)
  claimed:     boolean
  customToken: string | null   (written by the server, read once by the host)
```

The host creates this node **unauthenticated** — it has no credential yet,
which is the whole point. That is safe only because nothing secret travels in
that direction: the host publishes a device name, and only the server (holding
the service-account key) can add `customToken`. Read access is scoped to the
`customToken` child alone, so a caller cannot enumerate pending pairings.
Single-use, ten-minute TTL, and deleted by the host as soon as it has
exchanged the token.

## RTDB — audit chain (§7.3)

```
auditLog/{uid}/{entryId}
  uid:          string
  action:       "login" | "session_start" | "session_end" | "permission_denied" | "totp_enabled"
  timestamp:    number (ms epoch)
  metadata:     object
  previousHash: string   (SHA-256 of the previous entry — the chain)
  hash:         string
```

**Deviation from §10.1**, which places `auditLog` in Firestore: the host agent
writes it over the RTDB REST API, and moving it would mean carrying a second
Firestore client in the host for no gain. The properties the hash chain
depends on are preserved — append-only (an entry may be created, never
rewritten) and readable only by its own uid.

## Firestore — durable records

### `users/{uid}` (§6.3)

```ts
{
  email: string
  displayName: string
  emailVerified: boolean
  createdAt: Timestamp
  totpEnabled: boolean
  totpSecretEncrypted: string | null   // never plaintext (§2.3)
}
```

### `devices/{deviceId}` (§6.3, §8.2)

```ts
{
  ownerUid: string
  platform: "windows" | "linux-x11" | "linux-wayland"
  lastSeenAt: Timestamp
  appVersion: string
  protocolVersion: string
}
```

### `sessionHistory/{sessionId}` (§6.3)

Distinct from the RTDB live session node — written once at session end.

```ts
{
  hostUid: string
  viewerUid: string
  hostPlatform: string
  startedAt: Timestamp
  endedAt: Timestamp
  durationSeconds: number
  endReason: "user_ended" | "timeout" | "error" | "crash"
}
```

### `auditLog/{entryId}` (§6.3, §7.3)

Append-only. Each entry includes the SHA-256 hash of the previous entry,
forming a simple hash chain — any retroactive edit is detectable on read,
no paid log-integrity service required.

```ts
{
  uid: string
  action: "login" | "session_start" | "session_end" |
          "permission_denied" | "totp_enabled"
  timestamp: Timestamp
  metadata: Map<string, any>
  prevHash: string | null   // SHA-256(previousEntry) — §7.3 hash chain
}
```

## Retention (§10.6)

| Collection | Retention | Notes |
|---|---|---|
| `sessionHistory` | 90 days | Deleted by scheduled GitHub Action or Cloud Function |
| `auditLog` | 1 year | Low-volume, supports hash-chain integrity |
| `users` | Until account deletion | Multi-step client flow (§10.6) |

## Backup (§10.6 — the honest constraint)

Firestore's official scheduled export goes through Cloud Storage → Blaze plan.
The free workaround on Path A: a scheduled GitHub Action calls the Firestore
REST API (Spark-eligible), dumps collections to JSON, encrypts with `age`/`gpg`
(key in GitHub Actions secret), commits the encrypted snapshot to a private
repo. Free, real, restorable.
