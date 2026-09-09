#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Uso: npm run deploy:pi -- usuario@raspberrypi.local"
  exit 1
fi

TARGET="$1"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_DIR="rasp-deploy"

cd "$ROOT"
npm run build

ssh "$TARGET" "mkdir -p ~/$REMOTE_DIR"
rsync -az --delete --relative \
  ./dist ./server ./deploy/pi ./scripts/diagnose-google.mjs ./scripts/import-google-client.mjs \
  "$TARGET:~/$REMOTE_DIR/"

ssh -t "$TARGET" "~/$REMOTE_DIR/deploy/pi/install.sh ~/$REMOTE_DIR"

echo
echo "Despliegue terminado. Reinicia la Raspberry cuando quieras probar el arranque completo:"
echo "  ssh -t $TARGET 'sudo reboot'"
