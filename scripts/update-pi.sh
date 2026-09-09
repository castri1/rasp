#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -d "$ROOT/.git" ]]; then
  echo "Esta instalación no proviene de GitHub. Clona primero el repositorio en ~/rasp."
  exit 1
fi

git -C "$ROOT" pull --ff-only
bash "$ROOT/scripts/install-pi.sh"
