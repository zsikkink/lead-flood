#!/usr/bin/env bash
set -euo pipefail

pnpm install
pnpm dev:infra
cp -n apps/api/.env.example apps/api/.env.local || true
cp -n apps/worker/.env.example apps/worker/.env.local || true
cp -n apps/web/.env.example apps/web/.env.local || true
cp -n packages/db/.env.example packages/db/.env || true
pnpm db:migrate
pnpm db:seed

echo "Bootstrap complete. Run 'pnpm dev' to start apps."
