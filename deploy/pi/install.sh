#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
INSTALL_DIR="${RASP_INSTALL_DIR:-$HOME/.local/share/rasp}"
SERVICE_NAME="rasp.service"
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME"
LABWC_AUTOSTART="$HOME/.config/labwc/autostart"
XDG_AUTOSTART="$HOME/.config/autostart/rasp-kiosk.desktop"

if [[ $EUID -eq 0 ]]; then
  echo "Ejecuta este instalador con tu usuario normal, sin sudo. Pedirá sudo solo para registrar el servicio."
  exit 1
fi

if [[ ! -f "$SOURCE_DIR/dist/index.html" ]]; then
  echo "Falta dist/index.html. Compila el proyecto en el Mac antes de copiarlo."
  exit 1
fi

PACKAGES=()
if ! command -v node >/dev/null 2>&1; then PACKAGES+=(nodejs); fi
if ! command -v chromium >/dev/null 2>&1 && ! command -v chromium-browser >/dev/null 2>&1; then PACKAGES+=(chromium); fi
if (( ${#PACKAGES[@]} )); then
  echo "Instalando dependencias: ${PACKAGES[*]}"
  sudo apt-get update
  sudo apt-get install -y "${PACKAGES[@]}"
fi

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if (( NODE_MAJOR < 18 )); then
  echo "Rasp necesita Node.js 18 o posterior. Versión encontrada: $(node --version)"
  exit 1
fi

BROWSER="$(command -v chromium || command -v chromium-browser || true)"
if [[ -z "$BROWSER" ]]; then
  echo "No se encontró Chromium después de instalar las dependencias."
  exit 1
fi

mkdir -p "$INSTALL_DIR" "$INSTALL_DIR/.rasp"
rm -rf "$INSTALL_DIR/dist" "$INSTALL_DIR/server" "$INSTALL_DIR/scripts"
cp -R "$SOURCE_DIR/dist" "$INSTALL_DIR/dist"
mkdir -p "$INSTALL_DIR/server" "$INSTALL_DIR/scripts"
cp "$SOURCE_DIR/server/index.mjs" "$SOURCE_DIR/server/macBridge.mjs" "$SOURCE_DIR/server/alexaBridge.mjs" "$SOURCE_DIR/server/googleCalendar.mjs" "$INSTALL_DIR/server/"
if [[ -f "$SOURCE_DIR/scripts/diagnose-google.mjs" ]]; then
  cp "$SOURCE_DIR/scripts/diagnose-google.mjs" "$INSTALL_DIR/scripts/diagnose-google.mjs"
fi
if [[ -f "$SOURCE_DIR/scripts/import-google-client.mjs" ]]; then
  cp "$SOURCE_DIR/scripts/import-google-client.mjs" "$INSTALL_DIR/scripts/import-google-client.mjs"
fi

sed \
  -e "s|@INSTALL_DIR@|$INSTALL_DIR|g" \
  -e "s|@NODE@|$(command -v node)|g" \
  -e "s|@USER@|$USER|g" \
  -e "s|@HOME@|$HOME|g" \
  "$SOURCE_DIR/deploy/pi/rasp.service.template" > /tmp/rasp.service
sudo install -m 0644 /tmp/rasp.service "$SERVICE_FILE"
rm -f /tmp/rasp.service

sed \
  -e "s|@BROWSER@|$BROWSER|g" \
  "$SOURCE_DIR/deploy/pi/start-kiosk.sh.template" > "$INSTALL_DIR/start-kiosk.sh"
chmod 0755 "$INSTALL_DIR/start-kiosk.sh"

if command -v labwc >/dev/null 2>&1 || [[ -d /etc/xdg/labwc ]]; then
  mkdir -p "$(dirname "$LABWC_AUTOSTART")"
  touch "$LABWC_AUTOSTART"
  awk '
    $0 == "# RASP KIOSK BEGIN" { skip=1; next }
    $0 == "# RASP KIOSK END" { skip=0; next }
    !skip { print }
  ' "$LABWC_AUTOSTART" > "$LABWC_AUTOSTART.tmp"
  mv "$LABWC_AUTOSTART.tmp" "$LABWC_AUTOSTART"
  {
    echo
    echo "# RASP KIOSK BEGIN"
    printf '%q &\n' "$INSTALL_DIR/start-kiosk.sh"
    echo "# RASP KIOSK END"
  } >> "$LABWC_AUTOSTART"
  rm -f "$XDG_AUTOSTART"
  AUTOSTART_KIND="labwc"
else
  mkdir -p "$(dirname "$XDG_AUTOSTART")"
  sed "s|@KIOSK_SCRIPT@|$INSTALL_DIR/start-kiosk.sh|g" \
    "$SOURCE_DIR/deploy/pi/rasp-kiosk.desktop.template" > "$XDG_AUTOSTART"
  AUTOSTART_KIND="XDG"
fi

sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

echo
echo "Rasp quedó instalada en $INSTALL_DIR"
echo "Servidor: $(systemctl is-active "$SERVICE_NAME") · http://127.0.0.1:4173/app"
echo "Inicio de Chromium configurado mediante $AUTOSTART_KIND."
echo "Reinicia la Raspberry para comprobar el arranque completo: sudo reboot"
