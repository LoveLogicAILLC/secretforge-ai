#!/usr/bin/env bash
set -euo pipefail

# Usage: OPENAI_API_KEY=... ANTHROPIC_API_KEY=... ENCRYPTION_KEY=... \
#   CLOUDFLARE_ENV=production ./scripts/cloudflare/set_secrets.sh [--dry-run]
#
# CLOUDFLARE_ENV defaults to "production".

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

ENVIRONMENT="${CLOUDFLARE_ENV:-production}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_DIR="$ROOT_DIR/packages/api"
LOG_DIR="$ROOT_DIR/infrastructure/production"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
LOG_FILE="$LOG_DIR/cloudflare-secrets-$TIMESTAMP.log"

mkdir -p "$LOG_DIR"

run_cmd() {
  if $DRY_RUN; then
    printf '[dry-run] %s\n' "$*"
  else
    printf '→ %s\n' "$*" | tee -a "$LOG_FILE"
    "$@" 2>&1 | tee -a "$LOG_FILE"
    printf '\n' | tee -a "$LOG_FILE"
  fi
}

require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Environment variable $name is required." >&2
    exit 1
  fi
}

echo "SecretForge Cloudflare secret loader (env: $ENVIRONMENT)"
echo "Log file: $LOG_FILE"

require_var OPENAI_API_KEY
require_var ANTHROPIC_API_KEY
require_var ENCRYPTION_KEY

if ! $DRY_RUN && ! command -v wrangler >/dev/null 2>&1; then
  echo "wrangler CLI is required. Install via 'npm install -g wrangler' or 'pnpm add -g wrangler'." >&2
  exit 1
fi

pushd "$API_DIR" >/dev/null

put_secret() {
  local key="$1"
  local value="$2"

  if $DRY_RUN; then
    printf '[dry-run] wrangler secret put %s --env %s\n' "$key" "$ENVIRONMENT"
  else
    printf '%s' "$value" | wrangler secret put "$key" --env "$ENVIRONMENT" 2>&1 | tee -a "$LOG_FILE"
  fi
}

put_secret OPENAI_API_KEY "$OPENAI_API_KEY"
put_secret ANTHROPIC_API_KEY "$ANTHROPIC_API_KEY"
put_secret ENCRYPTION_KEY "$ENCRYPTION_KEY"

popd >/dev/null

echo "Secrets updated. Verify via 'wrangler secret list --env $ENVIRONMENT'."
