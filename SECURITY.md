# Security Policy

## Overview

Duxo is a remote desktop application where **the host user's "Allow" click is
the most important security control** (§2.4). Everything else in the security
model is secondary to that one control.

All connections are encrypted end-to-end via WebRTC's DTLS-SRTP. No party —
not Firebase, not TURN relays, not our servers — can decrypt traffic in transit.

## Threat model (§2.7, STRIDE-style)

| Threat | Control | Cost |
|---|---|---|
| Spoofed viewer identity | JWT signature verification client-side (§2.5) | Free |
| Session code brute-force | 5 attempts/min/IP, 8-digit code space (100M combos) | Free |
| Tampering with session state | RTDB rules restrict writes to auth.uid-scoped fields | Free |
| Information disclosure (screen leak) | DTLS-SRTP encryption built into WebRTC | Free |
| Denial of service (RTDB flooding) | ICE batching, SDP size caps, per-IP rate limits | Free |
| Elevation of privilege (fake Allow) | Native host-rendered popup, no default focus (§2.4) | Free |
| Local secret theft on host | OS keychain via keyring crate, never plaintext (§2.6) | Free |

## Reporting a vulnerability

If you find a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue.
2. Use **GitHub's private security advisories** on this repository
   (Security → Report a vulnerability). That is the only reporting channel:
   this project owns no domain, so the `security@duxo.dev` address previously
   listed here did not resolve and mail to it bounced. `duxo.app` is an
   unrelated product that happens to share the name — do not send anything
   there.
3. Include: description, steps to reproduce, potential impact, and any suggested fix.
4. We aim to acknowledge reports within 48 hours and provide a fix within 7 days for critical issues.

## Session identity vs. account identity

A logged-in viewer is NOT automatically allowed to control a host. The host's
explicit "Allow" click is the **only** thing that grants control, every single
time, no exceptions. There is no "always allow this viewer" in MVP.

## Two-factor authentication

Enforced server-side since 2026-09-05. This section previously said the
opposite, and the three weaknesses it described were each real; they are
listed here because the shape of the fix is the useful part.

| Was | Now |
|---|---|
| The gate was a `router.replace` in the browser, so devtools or a typed URL walked past it | `proxy.ts` redirects to `/verify-2fa`; the proof is an HttpOnly cookie, signed server-side and bound to the uid, that the page cannot read or forge |
| `totpSecretEncrypted` used a PBKDF2 password derived from the uid — which is also the Firestore path the ciphertext sits at, so one read yielded both | The key is HKDF-derived from `TOTP_MASTER_KEY`, which never leaves the server. `/api/totp/{setup,activate,verify}` do the crypto; the plaintext secret does not exist in a page context after enrolment |
| WebAuthn checked only that the returned credential id appeared in a list the caller itself supplied — a public identifier, so the private key was never exercised | `/api/webauthn/{options,verify}` hold the challenge and public keys and verify signature, challenge, origin, rpID and an advancing counter. `lib/webauthn.ts` is browser ceremony only |

Two properties worth stating because they are easy to regress:

- **It fails closed.** Anything unverifiable — a missing, expired, tampered,
  or wrong-uid cookie — falls through to the challenge rather than being
  given the benefit of the doubt.
- **`/verify-2fa`, `/settings` and the 2FA API routes are exempt on purpose.**
  Otherwise the only way to satisfy the check would be to have already
  satisfied it, and a lost phone would become a lost account.

Whether 2FA is *enabled* rides on Clerk `publicMetadata` rather than
Firestore, because middleware runs in the edge runtime and `firebase-admin`
cannot follow it there.

`TOTP_MASTER_KEY` must be set for any of this to work — `/api/totp/*` answers
503 without it, and `/api/health` reports the deploy misconfigured. Changing
it makes every stored TOTP secret undecryptable.

## Signing and trust

- Windows binaries ship unsigned for MVP (SmartScreen warning expected).
- Applied to SignPath.io OSS program for free code signing (reduces warnings over time).
- Every build is verifiable via GitHub Actions CI.
- All source code is public.

## What free security cannot cover

Stated plainly: hardware attestation (no TPM-backed trust without a paid
service), guaranteed binary integrity for end users (SignPath reduces but
doesn't eliminate the unsigned-binary gap), and social engineering (no
amount of engineering solves a host user clicking "Allow" for someone they
shouldn't trust).
