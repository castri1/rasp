#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Ejecuta este instalador con sudo: sudo bash scripts/install-home-assistant.sh"
  exit 1
fi

ARCH="$(uname -m)"
if [[ "$ARCH" != "aarch64" && "$ARCH" != "x86_64" ]]; then
  echo "Home Assistant actual requiere 64 bits. Arquitectura encontrada: $ARCH"
  exit 1
fi

TARGET_USER="${SUDO_USER:-}"
if [[ -z "$TARGET_USER" || "$TARGET_USER" == "root" ]]; then
  echo "Ejecuta el script con sudo desde tu usuario normal, no desde una sesión root."
  exit 1
fi

TARGET_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
CONFIG_DIR="${RASP_HA_CONFIG_DIR:-$TARGET_HOME/.local/share/homeassistant}"

echo "Instalando Docker Engine desde Debian…"
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io
systemctl enable --now docker.service

DOCKER_MAJOR="$(docker version --format '{{.Server.Version}}' | cut -d. -f1)"
if (( DOCKER_MAJOR < 23 )); then
  echo "Home Assistant requiere Docker Engine 23 o posterior. Versión encontrada: $(docker --version)"
  exit 1
fi

install -d -m 0700 "$CONFIG_DIR"

if docker container inspect homeassistant >/dev/null 2>&1; then
  echo "El contenedor homeassistant ya existe; conservando su configuración."
  docker start homeassistant >/dev/null
else
  echo "Descargando Home Assistant para $ARCH…"
  docker pull ghcr.io/home-assistant/home-assistant:stable
  docker run -d \
    --name homeassistant \
    --privileged \
    --restart=unless-stopped \
    --stop-timeout 60 \
    --log-opt max-size=20m \
    --log-opt max-file=3 \
    -e TZ=America/Bogota \
    -v "$CONFIG_DIR:/config" \
    -v /etc/localtime:/etc/localtime:ro \
    -v /run/dbus:/run/dbus:ro \
    --network=host \
    ghcr.io/home-assistant/home-assistant:stable >/dev/null
fi

echo "Esperando a que Home Assistant abra el puerto 8123…"
for _ in $(seq 1 60); do
  if curl -fsS --max-time 2 http://127.0.0.1:8123/ >/dev/null 2>&1; then
    echo
    echo "Home Assistant está listo en http://pi.local:8123"
    echo "Configuración persistente: $CONFIG_DIR"
    echo "La app Rasp continúa en http://127.0.0.1:4173/app"
    exit 0
  fi
  sleep 2
done

echo "El contenedor está iniciado, pero la interfaz aún no respondió."
echo "Comprueba su estado con: sudo docker logs --tail 50 homeassistant"
exit 1
