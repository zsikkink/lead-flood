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
    echo "[db:verify:prod] ENV_FILE not found: $env_file" >&2
    exit 1
  fi

  echo "[db:verify:prod] Loading env from $env_file"
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[db:verify:prod] Missing required command: $cmd" >&2
    exit 1
  fi
}

require_var() {
  local key="$1"
  if [[ -z "${!key:-}" ]]; then
    echo "[db:verify:prod] Missing required env var: $key" >&2
    exit 1
  fi
}

load_env_file

bash scripts/db/guard-no-prisma-migrate-prod.sh "supabase migration list"

require_cmd supabase
require_cmd psql
require_var DATABASE_URL

if [[ ! -d "supabase/migrations" ]]; then
  echo "[db:verify:prod] Missing supabase/migrations directory" >&2
  exit 1
fi

local_latest_file="$(find supabase/migrations -maxdepth 1 -type f -name '*.sql' -print | xargs -n1 basename | sort | tail -n1 | sed 's/\.sql$//')"
local_count="$(find supabase/migrations -maxdepth 1 -type f -name '*.sql' | wc -l | tr -d ' ')"
local_latest_version="${local_latest_file%%_*}"

if [[ -z "$local_latest_file" ]]; then
  echo "[db:verify:prod] No local SQL migrations found in supabase/migrations" >&2
  exit 1
fi

bash scripts/db/supabase-link.sh --require-linked

echo "[db:verify:prod] Supabase migration list (local vs remote)"
list_cmd=(supabase migration list --linked --yes)
if [[ -n "${SUPABASE_DB_PASSWORD:-}" ]]; then
  list_cmd+=(--password "$SUPABASE_DB_PASSWORD")
fi
"${list_cmd[@]}"

echo "[db:verify:prod] Checking for pending migrations with dry-run"
dry_run_cmd=(supabase db push --linked --dry-run --yes)
if [[ -n "${SUPABASE_DB_PASSWORD:-}" ]]; then
  dry_run_cmd+=(--password "$SUPABASE_DB_PASSWORD")
fi
dry_run_output="$("${dry_run_cmd[@]}" 2>&1)"
echo "$dry_run_output"
if ! grep -Eq "up to date|No database changes to push|Remote database is up to date" <<<"$dry_run_output"; then
  echo "[db:verify:prod] Pending migrations or schema drift detected. Run pnpm db:migrate:prod." >&2
  exit 1
fi

echo "[db:verify:prod] Verifying remote migration metadata via SQL"
remote_count="$(psql "$DATABASE_URL" -Atqc "SELECT COUNT(*) FROM supabase_migrations.schema_migrations;")"
remote_has_latest="$(psql "$DATABASE_URL" -Atqc "SELECT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '$local_latest_version');")"

if [[ "$remote_count" -lt 1 ]]; then
  echo "[db:verify:prod] Remote migration history table is empty." >&2
  exit 1
fi

if [[ "$remote_has_latest" != "t" ]]; then
  echo "[db:verify:prod] Latest local migration is not applied remotely: $local_latest_file" >&2
  exit 1
fi

if [[ "$remote_count" -lt "$local_count" ]]; then
  echo "[db:verify:prod] Remote migration count ($remote_count) is behind local migration count ($local_count)." >&2
  exit 1
fi

echo "[db:verify:prod] Remote DB verification successful"
echo "[db:verify:prod] local_migrations=$local_count remote_migrations=$remote_count latest=$local_latest_file"
