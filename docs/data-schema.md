# Duxo — Data Schema

Source of truth for the durable Firestore records (§6.3) and the live RTDB
signaling node (§0.6). RTDB and Firestore serve different roles and **must
not** be mixed.

## Rule of thumb

| Store | Role | Frequency |
|---|---|---|
| **RTDB** (`sessions/`, `codes/`, `rateLimit/`) | Live signaling: offer/answer, ICE candidates, status | High-frequency, ephemeral |
| **Firestore** (`users/`, `devices/`, `sessionHistory/`, `auditLog/`) | Durable records: profiles, device registry, history, audit | Low-frequency, persistent |

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
