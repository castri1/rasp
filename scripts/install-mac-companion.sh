#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-daniel@pi.local}"
IDENTITY="${RASP_SSH_IDENTITY:-$HOME/.ssh/rasp_codex_ed25519}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_DIR="$HOME/.local/share/rasp-mac"
CONFIG_FILE="$INSTALL_DIR/config.json"
COMPANION_PLIST="$HOME/Library/LaunchAgents/com.rasp.mac-companion.plist"
TUNNEL_PLIST="$HOME/Library/LaunchAgents/com.rasp.mac-tunnel.plist"
NODE="$(command -v node)"
TOKEN="$(openssl rand -hex 32)"
GUI_DOMAIN="gui/$(id -u)"

if [[ ! -f "$IDENTITY" ]]; then
  echo "No se encontró la llave SSH: $IDENTITY"
  exit 1
fi

umask 077
mkdir -p "$INSTALL_DIR/server" "$HOME/Library/LaunchAgents"
cp "$ROOT/server/macBridge.mjs" "$ROOT/server/macCompanion.mjs" "$INSTALL_DIR/server/"
printf '{"token":"%s"}\n' "$TOKEN" > "$CONFIG_FILE"
chmod 600 "$CONFIG_FILE"

cat > "$COMPANION_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.rasp.mac-companion</string>
  <key>ProgramArguments</key><array>
    <string>$NODE</string>
    <string>$INSTALL_DIR/server/macCompanion.mjs</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>RASP_MAC_CONFIG</key><string>$CONFIG_FILE</string>
    <key>RASP_MAC_PORT</key><string>4175</string>
    <key>RASP_FOCUS_READY_FILE</key><string>$INSTALL_DIR/focus-ready</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$INSTALL_DIR/companion.log</string>
  <key>StandardErrorPath</key><string>$INSTALL_DIR/companion-error.log</string>
</dict></plist>
EOF

cat > "$TUNNEL_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.rasp.mac-tunnel</string>
  <key>ProgramArguments</key><array>
    <string>/usr/bin/ssh</string>
    <string>-N</string>
    <string>-R</string><string>127.0.0.1:4175:127.0.0.1:4175</string>
    <string>-i</string><string>$IDENTITY</string>
    <string>-o</string><string>IdentitiesOnly=yes</string>
    <string>-o</string><string>BatchMode=yes</string>
    <string>-o</string><string>ExitOnForwardFailure=yes</string>
    <string>-o</string><string>ServerAliveInterval=30</string>
    <string>-o</string><string>ServerAliveCountMax=3</string>
    <string>-o</string><string>ConnectTimeout=10</string>
    <string>$TARGET</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$INSTALL_DIR/tunnel.log</string>
  <key>StandardErrorPath</key><string>$INSTALL_DIR/tunnel-error.log</string>
</dict></plist>
EOF
chmod 600 "$COMPANION_PLIST" "$TUNNEL_PLIST"

printf '{"url":"http://127.0.0.1:4175","token":"%s"}\n' "$TOKEN" | \
  ssh -i "$IDENTITY" -o IdentitiesOnly=yes "$TARGET" \
    'umask 077; mkdir -p "$HOME/.local/share/rasp/.rasp"; cat > "$HOME/.local/share/rasp/.rasp/mac.json"; chmod 600 "$HOME/.local/share/rasp/.rasp/mac.json"'

launchctl bootout "$GUI_DOMAIN/com.rasp.mac-companion" 2>/dev/null || true
launchctl bootout "$GUI_DOMAIN/com.rasp.mac-tunnel" 2>/dev/null || true
launchctl bootstrap "$GUI_DOMAIN" "$COMPANION_PLIST"
launchctl bootstrap "$GUI_DOMAIN" "$TUNNEL_PLIST"

echo "Acompañante instalado. Se iniciará automáticamente con tu sesión del Mac."
echo "Conexión segura configurada hacia $TARGET."
