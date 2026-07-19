# Contributing to Duxo

Thank you for your interest in contributing! This document covers conventions
and workflow so future-you (and future-contributors) aren't guessing.

## Git workflow (§4.2)

- **Trunk-based with short-lived feature branches.**
- Branch, build, PR-to-self (or push straight to main with CI gating), merge, delete branch.
- **Conventional commits** (required):
  - `feat:` — new feature
  - `fix:` — bug fix
  - `chore:` — maintenance (deps, CI, config)
  - `docs:` — documentation
  - `refactor:` — code restructure (no behavior change)
  - `test:` — tests only
  - `security:` — security-related changes

## Semantic versioning (§4.2)

Releases follow semver: `v0.1.0`, `v0.2.0`. MAJOR for breaking changes, MINOR
for additive features, PATCH for bug fixes. The self-update check compares
against this version tag.

## Code quality (§10.5)

### Rust (host agent)
| Tool | What it catches |
|---|---|
| `rustfmt` | Formatting consistency |
| `clippy -D warnings` | Common bug patterns, unidiomatic code |
| `cargo test` | Unit + integration tests |
| `cargo audit` | Known CVEs in dependencies |

### TypeScript (viewer)
| Tool | What it catches |
|---|---|
| ESLint + Prettier | Formatting + common bugs |
| `tsc --noEmit` | Type errors |
| Vitest | Component and logic tests |

## Testing strategy (§4.3)

- **Rust unit tests** (`cargo test`) — session state machine, JWT verification.
- **Frontend tests** (Vitest) — connect-form, permission-modal logic.
- **Cross-platform QA** — manual: Windows VM + Linux X11 (Ubuntu) and Wayland (Fedora).

## Design system (§9.2)

All UI components MUST use the design tokens defined in
`viewer/tailwind.config.ts`. No raw hex values in component code — enforced via
ESLint/Stylelint rule against literal hex outside the token file.

## Security (§4.4)

No phase is done until its security control has been manually tested to fail:
- Wrong code is rejected.
- Expired code is rejected.
- Unverified JWT is rejected.
- State transitions follow the §1.1 state machine.
