#!/usr/bin/env bash
set -euo pipefail

WITH_DOCKER=0

for arg in "$@"; do
  case "$arg" in
    --with-docker)
      WITH_DOCKER=1
      ;;
    *)
      echo "Unknown preflight option: $arg" >&2
      exit 1
      ;;
  esac
done

if ! command -v node >/dev/null 2>&1; then
  echo "Missing required dependency: node" >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "Missing required dependency: pnpm" >&2
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "${NODE_MAJOR}" -lt 22 ]; then
  echo "Node.js 22+ is required. Current: $(node -v)" >&2
  echo "Run 'nvm use' (or install Node 22+) and retry." >&2
  exit 1
fi

if [ "${WITH_DOCKER}" -eq 1 ]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "Missing required dependency: docker" >&2
    exit 1
  fi

  if ! docker compose version >/dev/null 2>&1; then
    echo "Docker Compose v2 is required (docker compose)." >&2
    exit 1
  fi

  if ! docker info >/dev/null 2>&1; then
    echo "Docker daemon is not running. Start Docker Desktop and retry." >&2
    exit 1
  fi
fi

echo "Preflight checks passed."
echo "Node: $(node -v)"
echo "pnpm: $(pnpm -v)"
if [ "${WITH_DOCKER}" -eq 1 ]; then
  COMPOSE_VERSION="$(docker compose version | head -n 1)"
  echo "Docker: $(docker --version | sed 's/, build.*//')"
  echo "Compose: ${COMPOSE_VERSION}"
fi
