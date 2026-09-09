#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="$ROOT/artifacts"
STAGE="$(mktemp -d /tmp/rasp-pi-bundle.XXXXXX)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$ARTIFACT_DIR" "$STAGE/rasp-deploy/server" "$STAGE/rasp-deploy/deploy"
cp -R "$ROOT/dist" "$STAGE/rasp-deploy/dist"
cp "$ROOT/server/index.mjs" "$ROOT/server/macBridge.mjs" "$ROOT/server/alexaBridge.mjs" "$ROOT/server/googleCalendar.mjs" "$STAGE/rasp-deploy/server/"
cp -R "$ROOT/deploy/pi" "$STAGE/rasp-deploy/deploy/pi"
mkdir -p "$STAGE/rasp-deploy/scripts"
cp "$ROOT/scripts/diagnose-google.mjs" "$ROOT/scripts/import-google-client.mjs" "$ROOT/scripts/install-home-assistant.sh" "$STAGE/rasp-deploy/scripts/"
chmod 0755 "$STAGE/rasp-deploy/deploy/pi/install.sh"

tar -C "$STAGE" -czf "$ARTIFACT_DIR/rasp-pi.tar.gz" rasp-deploy
echo "Paquete creado: $ARTIFACT_DIR/rasp-pi.tar.gz"
