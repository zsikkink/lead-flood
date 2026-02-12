#!/usr/bin/env bash
set -euo pipefail

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

if [ -f .env.local ]; then
  set -a
  source .env.local
  set +a
fi

exec tsx watch src/index.ts
