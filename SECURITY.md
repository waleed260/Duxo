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
2. Email your findings to: security@duxo.dev (or use GitHub's private security advisories if enabled).
3. Include: description, steps to reproduce, potential impact, and any suggested fix.
4. We aim to acknowledge reports within 48 hours and provide a fix within 7 days for critical issues.

## Session identity vs. account identity

A logged-in viewer is NOT automatically allowed to control a host. The host's
explicit "Allow" click is the **only** thing that grants control, every single
time, no exceptions. There is no "always allow this viewer" in MVP.

## Two-factor authentication is enrollment-only today

/settings offers TOTP and passkey enrolment, and the copy tells the user they
will need a code from their authenticator app the next time they sign in.
Nothing asks for one. `/verify-2fa` is a complete, working page that no flow
navigates to: Clerk's post-sign-in redirect goes straight to /dashboard.

Even wired up it would not be a security boundary, and it is listed here
rather than in the threat model above for that reason:

- The check runs in the browser. The gate is a `router.replace`, so anyone
  who can open devtools or type a URL is past it.
- `totpSecretEncrypted` is encrypted with a key derived from the user's own
  uid, which the client already has. That protects the secret from a casual
  glance at the database, not from whoever holds the session.
- It fails open. If the user document cannot be read, the page forwards to
  /dashboard, which is the right behaviour for a convenience gate and the
  wrong behaviour for a factor.

Real enforcement needs the code verified server-side and the result bound to
the session — which Clerk, already the identity provider here, provides
natively. Until that decision is made, treat the feature as a preference the
account holder has expressed, not as a control anything relies on.

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
