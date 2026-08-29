#!/usr/bin/env bash
# §7.1 — Generate Ed25519 keypair for Tauri updater signing.
# Run once per project, store the private key in a password manager or CI secret.
# The public key goes into tauri.conf.json -> plugins.updater.pubkey.
#
# Usage: ./scripts/updater-keygen.sh
set -euo pipefail

KEY_DIR="host-agent/src-tauri/updater-keys"

if [ -f "$KEY_DIR/duxo-updater.key" ]; then
    echo "Keypair already exists at $KEY_DIR/. Remove first to regenerate."
    exit 1
fi

mkdir -p "$KEY_DIR"

# Tauri's updater verifies signatures with minisign, NOT raw OpenSSL Ed25519 —
# an `openssl genpkey` keypair is silently incompatible and produces updates
# the app will refuse. `tauri signer generate` is the only correct source.
if ! command -v npx &>/dev/null; then
    echo "npx not found. Install Node.js, then re-run this script." >&2
    exit 1
fi

npx --yes @tauri-apps/cli@latest signer generate \
    -w "$KEY_DIR/duxo-updater.key"

echo ""
echo "=== PUBLIC KEY (paste into tauri.conf.json -> plugins.updater.pubkey) ==="
cat "$KEY_DIR/duxo-updater.key.pub"
echo ""
echo "=== KEEP PRIVATE KEY SAFE ==="
echo "Private key: $KEY_DIR/duxo-updater.key  (never commit — see .gitignore)"
echo "Add it as a GitHub Actions secret named UPDATER_SIGNING_KEY"
