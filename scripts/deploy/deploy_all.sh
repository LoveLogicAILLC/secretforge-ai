#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/deploy/deploy_all.sh [--dry-run]
# Runs pnpm install, builds packages, deploys API via Wrangler, and deploys the web app via Vercel.

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_DIR="$ROOT_DIR/packages/api"
WEB_DIR="$ROOT_DIR/packages/web"
LOG_DIR="$ROOT_DIR/infrastructure/production"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
LOG_FILE="$LOG_DIR/deploy-$TIMESTAMP.log"

mkdir -p "$LOG_DIR"

run_cmd() {
  if $DRY_RUN; then
    printf '[dry-run] (cd %s && %s)\n' "$1" "${*:2}"
  else
    local cwd="$1"
    shift
    printf '→ (%s) %s\n' "$cwd" "$*" | tee -a "$LOG_FILE"
    (cd "$cwd" && "$@") 2>&1 | tee -a "$LOG_FILE"
    printf '\n' | tee -a "$LOG_FILE"
  fi
}

echo "SecretForge unified deploy (log: $LOG_FILE)"

if ! $DRY_RUN; then
  if ! command -v pnpm >/dev/null 2>&1; then
    echo "pnpm is required. Install via 'corepack enable && corepack prepare pnpm@latest --activate'." >&2
    exit 1
  fi
  if ! command -v wrangler >/dev/null 2>&1; then
    echo "wrangler CLI is required." >&2
    exit 1
  fi
  if ! command -v vercel >/dev/null 2>&1; then
    echo "Vercel CLI is required. Install via 'npm install -g vercel'." >&2
    exit 1
  fi
fi

run_cmd "$ROOT_DIR" pnpm install
run_cmd "$ROOT_DIR" pnpm --filter @secretforge/api build
run_cmd "$ROOT_DIR" pnpm --filter @secretforge/web build
run_cmd "$API_DIR" wrangler deploy --env production
run_cmd "$WEB_DIR" vercel --prod

echo "Deployment pipeline finished. Check $LOG_FILE for full output."
