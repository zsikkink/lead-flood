#!/usr/bin/env bash
set -euo pipefail

COMMAND_TEXT="${*:-}"

is_production_context=0
if [[ "${NODE_ENV:-}" == "production" || "${ENVIRONMENT:-}" == "production" || "${PROD_GUARD:-}" == "1" ]]; then
  is_production_context=1
fi

if [[ "$is_production_context" -eq 1 && "$COMMAND_TEXT" == *"prisma migrate"* ]]; then
  echo "[db:guard] Forbidden command in production context: $COMMAND_TEXT" >&2
  echo "[db:guard] Prisma migrations are not canonical for production." >&2
  echo "[db:guard] Use Supabase SQL-first flow instead:" >&2
  echo "[db:guard]   pnpm db:link" >&2
  echo "[db:guard]   pnpm db:migrate:prod" >&2
  echo "[db:guard]   pnpm db:verify:prod" >&2
  exit 1
fi
