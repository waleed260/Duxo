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
