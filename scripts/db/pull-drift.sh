#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

CONFIRM=0

for arg in "$@"; do
  case "$arg" in
    --confirm)
      CONFIRM=1
      ;;
    *)
      echo "[db:pull:drift] Unknown option: $arg" >&2
      echo "[db:pull:drift] Usage: pnpm db:pull:drift -- --confirm" >&2
      exit 1
      ;;
  esac
done

if [[ "$CONFIRM" -ne 1 ]]; then
  echo "[db:pull:drift] Refusing to run without explicit --confirm." >&2
  echo "[db:pull:drift] WARNING: supabase db pull can generate noisy diffs." >&2
  echo "[db:pull:drift] Inspect generated SQL before committing." >&2
  exit 1
fi

load_env_file() {
  local env_file="${ENV_FILE:-}"
  if [[ -z "$env_file" ]]; then
    return
  fi

  if [[ ! -f "$env_file" ]]; then
    echo "[db:pull:drift] ENV_FILE not found: $env_file" >&2
    exit 1
  fi

  echo "[db:pull:drift] Loading env from $env_file"
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[db:pull:drift] Missing required command: $cmd" >&2
    exit 1
  fi
}

load_env_file

require_cmd supabase

bash scripts/db/supabase-link.sh --require-linked

before_latest="$(find supabase/migrations -maxdepth 1 -type f -name '*.sql' -print | xargs -n1 basename | sort | tail -n1 || true)"

echo "[db:pull:drift] Pulling remote schema drift into supabase/migrations"
pull_cmd=(supabase db pull --linked --yes)
if [[ -n "${SUPABASE_DB_PASSWORD:-}" ]]; then
  pull_cmd+=(--password "$SUPABASE_DB_PASSWORD")
fi

"${pull_cmd[@]}"

after_latest="$(find supabase/migrations -maxdepth 1 -type f -name '*.sql' -print | xargs -n1 basename | sort | tail -n1 || true)"

if [[ -z "$after_latest" ]]; then
  echo "[db:pull:drift] No migration files found after pull." >&2
  exit 1
fi

if [[ "$before_latest" == "$after_latest" ]]; then
  echo "[db:pull:drift] Pull completed but no new migration filename detected. Review output carefully."
else
  echo "[db:pull:drift] New/updated migration file: supabase/migrations/$after_latest"
fi

echo "[db:pull:drift] Next steps: review SQL diff, run verify, then commit."
