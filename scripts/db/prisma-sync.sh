#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

load_env_file() {
  local env_file="${ENV_FILE:-}"
  if [[ -z "$env_file" ]]; then
    return
  fi

  if [[ ! -f "$env_file" ]]; then
    echo "[db:prisma:sync] ENV_FILE not found: $env_file" >&2
    exit 1
  fi

  echo "[db:prisma:sync] Loading env from $env_file"
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
}

require_var() {
  local key="$1"
  if [[ -z "${!key:-}" ]]; then
    echo "[db:prisma:sync] Missing required env var: $key" >&2
    exit 1
  fi
}

load_env_file

if [[ -z "${DIRECT_URL:-}" && -n "${DATABASE_URL:-}" ]]; then
  export DIRECT_URL="$DATABASE_URL"
fi
if [[ -z "${DATABASE_URL:-}" && -n "${DIRECT_URL:-}" ]]; then
  export DATABASE_URL="$DIRECT_URL"
fi

require_var DATABASE_URL
require_var DIRECT_URL

echo "[db:prisma:sync] Introspecting DB schema into Prisma schema"
pnpm --filter @lead-flood/db exec prisma db pull --schema prisma/schema.prisma

echo "[db:prisma:sync] Generating Prisma client"
pnpm --filter @lead-flood/db prisma:generate

echo "[db:prisma:sync] Prisma schema + client are synced from DB"
