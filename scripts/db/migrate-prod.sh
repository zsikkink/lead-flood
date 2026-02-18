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
    echo "[db:migrate:prod] ENV_FILE not found: $env_file" >&2
    exit 1
  fi

  echo "[db:migrate:prod] Loading env from $env_file"
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[db:migrate:prod] Missing required command: $cmd" >&2
    exit 1
  fi
}

load_env_file

bash scripts/db/guard-no-prisma-migrate-prod.sh "supabase db push"

require_cmd supabase

if [[ ! -d "supabase/migrations" ]]; then
  echo "[db:migrate:prod] Missing supabase/migrations directory" >&2
  exit 1
fi

migration_count="$(find supabase/migrations -maxdepth 1 -type f -name '*.sql' | wc -l | tr -d ' ')"
if [[ "$migration_count" == "0" ]]; then
  echo "[db:migrate:prod] No SQL migrations found in supabase/migrations" >&2
  exit 1
fi

bash scripts/db/supabase-link.sh --require-linked

echo "[db:migrate:prod] Applying SQL migrations from supabase/migrations to linked project"
push_cmd=(supabase db push --linked --include-all --yes)
if [[ -n "${SUPABASE_DB_PASSWORD:-}" ]]; then
  push_cmd+=(--password "$SUPABASE_DB_PASSWORD")
fi

if ! "${push_cmd[@]}"; then
  echo "[db:migrate:prod] Migration apply failed." >&2
  echo "[db:migrate:prod] If CLI requests credentials in non-interactive mode, set SUPABASE_DB_PASSWORD manually." >&2
  exit 1
fi

echo "[db:migrate:prod] Supabase migrations applied successfully"
