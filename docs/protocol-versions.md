# Duxo — Protocol Version Compatibility Matrix (§6.1)

Every signaling message and every session-init payload carries a
`protocolVersion` field. Semantic versioning is tied to the **wire protocol**,
not the app:

- **PATCH** — no wire changes
- **MINOR** — additive, backward-compatible fields (e.g. adding
  `quality_indicator` in v1.2)
- **MAJOR** — breaking change to existing message shape

## Negotiation

1. Viewer declares its supported protocol range on `REQUESTED`.
2. Host checks against its own version **before** `ALLOWED`.
3. Incompatible → status becomes `incompatible_version`, viewer sees
   "please update" (never a silent hang or cryptic WebRTC failure).
4. **Capability flags** negotiate down rather than failing the session — a
   v1.0 host with a v1.2 viewer disables clipboard sync, doesn't drop the
   whole session. Hard incompatibility is reserved for MAJOR bumps only.

## Compatibility Matrix

| Host version | Compatible viewer range | Notes |
|---|---|---|
| 1.0.x | 1.0.x – 1.2.x | Baseline protocol |
| 1.1.x | 1.0.x – 1.3.x | Added `ping`/`pong` quality messages, backward compatible |
| 1.2.x | 1.1.x – 1.3.x | Added `clipboard` capability flag; 1.0.x viewers lose clipboard, not the whole session |

## Capability flags

| Capability | Min version | Purpose |
|---|---|---|
| `clipboard` | 1.2 | Clipboard sync over data channel |
| `file_transfer` | 1.1 | Chunked file transfer (≤10MB, §1.4) |
| `quality_indicator` | 1.1 | ping/pong RTT → connection quality UI |

## Update this file

Update with every release. This file is also referenced by the host-agent
update check (§1.5) and surfaced in the Docs section of the marketing site
(Part 11) — technical users doing risk assessment before installing an
unsigned binary look for exactly this.
