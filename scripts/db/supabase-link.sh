#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

DEFAULT_PROJECT_REF="cbcgrzvqidtrtrtnzlso"
MODE="link"

if [[ "${1:-}" == "--require-linked" ]]; then
  MODE="require-linked"
fi

load_env_file() {
  local env_file="${ENV_FILE:-}"
  if [[ -z "$env_file" ]]; then
    return
  fi

  if [[ ! -f "$env_file" ]]; then
    echo "[db:link] ENV_FILE not found: $env_file" >&2
    exit 1
  fi

  echo "[db:link] Loading env from $env_file"
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[db:link] Missing required command: $cmd" >&2
    echo "[db:link] Install Supabase CLI: https://supabase.com/docs/guides/cli" >&2
    exit 1
  fi
}

load_env_file

require_cmd supabase

PROJECT_REF="${SUPABASE_PROJECT_REF:-$DEFAULT_PROJECT_REF}"
if [[ -z "$PROJECT_REF" ]]; then
  echo "[db:link] Missing SUPABASE_PROJECT_REF" >&2
  exit 1
fi

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  if ! supabase projects list >/dev/null 2>&1; then
    echo "[db:link] Supabase CLI is not authenticated." >&2
    echo "[db:link] Run 'supabase login' or export SUPABASE_ACCESS_TOKEN." >&2
    exit 1
  fi
fi

mkdir -p supabase

current_ref=""
if [[ -f "supabase/.temp/project-ref" ]]; then
  current_ref="$(tr -d '[:space:]' < supabase/.temp/project-ref)"
fi

if [[ "$current_ref" == "$PROJECT_REF" ]]; then
  echo "[db:link] Supabase project already linked: $PROJECT_REF"
  exit 0
fi

if [[ "$MODE" == "require-linked" ]]; then
  echo "[db:link] Supabase project is not linked to '$PROJECT_REF'." >&2
  echo "[db:link] Run: pnpm db:link" >&2
  exit 1
fi

echo "[db:link] Linking Supabase project: $PROJECT_REF"
link_cmd=(supabase link --project-ref "$PROJECT_REF")
if [[ -n "${SUPABASE_DB_PASSWORD:-}" ]]; then
  link_cmd+=(--password "$SUPABASE_DB_PASSWORD")
fi

if ! "${link_cmd[@]}"; then
  echo "[db:link] Failed to link project '$PROJECT_REF'." >&2
  echo "[db:link] Ensure project ref is correct and CLI is authenticated." >&2
  echo "[db:link] You can also set SUPABASE_DB_PASSWORD for non-interactive linking." >&2
  exit 1
fi

if [[ ! -f "supabase/.temp/project-ref" ]]; then
  echo "[db:link] Link command succeeded but no linked project metadata found at supabase/.temp/project-ref" >&2
  exit 1
fi

linked_ref="$(tr -d '[:space:]' < supabase/.temp/project-ref)"
if [[ "$linked_ref" != "$PROJECT_REF" ]]; then
  echo "[db:link] Linked project ref mismatch. Expected '$PROJECT_REF', got '$linked_ref'." >&2
  exit 1
fi

echo "[db:link] Supabase link successful: $linked_ref"
