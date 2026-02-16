#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

bash scripts/preflight.sh --with-docker

pnpm install --frozen-lockfile

cp -n apps/api/.env.example apps/api/.env.local || true
cp -n apps/worker/.env.example apps/worker/.env.local || true
cp -n apps/web/.env.example apps/web/.env.local || true
cp -n packages/db/.env.example packages/db/.env || true

pnpm dev:infra
pnpm db:migrate
pnpm db:seed
pnpm icp:seed

echo "Bootstrap complete."
echo "Start services with: pnpm dev"
echo "Health checks:"
echo "  API: http://localhost:5050/health"
echo "  Web: http://localhost:3000"
