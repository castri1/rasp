#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -f "$ROOT/dist/index.html" ]]; then
  echo "Esta copia no incluye la aplicación compilada. Descarga la rama main completa desde GitHub."
  exit 1
fi

bash "$ROOT/deploy/pi/install.sh" "$ROOT"

echo
echo "Instalación terminada. Reinicia la pantalla con: sudo reboot"
