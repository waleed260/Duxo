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

# Use Tauri's built-in key generation via `tauri signer generate`,
# or fall back to native OpenSSL.
if command -v npx &>/dev/null && npx --yes @tauri-apps/cli@latest signer generate -h &>/dev/null; then
    npx @tauri-apps/cli@latest signer generate \
        -k "$KEY_DIR/duxo-updater.key" \
        -p "$KEY_DIR/duxo-updater.pub"
    echo "Keys generated with @tauri-apps/cli."
else
    # Fallback: generate Ed25519 with OpenSSL.
    openssl genpkey -algorithm ed25519 -out "$KEY_DIR/duxo-updater.key"
    openssl pkey -in "$KEY_DIR/duxo-updater.key" -pubout -out "$KEY_DIR/duxo-updater.pub"
    echo "Keys generated with OpenSSL."
fi

echo ""
echo "=== PUBLIC KEY (paste into tauri.conf.json -> plugins.updater.pubkey) ==="
cat "$KEY_DIR/duxo-updater.pub"
echo ""
echo "=== KEEP PRIVATE KEY SAFE ==="
echo "Private key: $KEY_DIR/duxo-updater.key"
echo "Add it as a GitHub Actions secret named UPDATER_SIGNING_KEY"
