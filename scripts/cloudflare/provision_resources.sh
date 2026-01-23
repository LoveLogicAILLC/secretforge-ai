#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/cloudflare/provision_resources.sh [--dry-run]
# Creates Cloudflare D1, KV, Vectorize, and optional Hyperdrive resources for production.

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_DIR="$ROOT_DIR/packages/api"
LOG_DIR="$ROOT_DIR/infrastructure/production"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
LOG_FILE="$LOG_DIR/cloudflare-provision-$TIMESTAMP.log"

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

echo "SecretForge Cloudflare provisioning (log: $LOG_FILE)"
echo "API directory: $API_DIR"

if ! $DRY_RUN && ! command -v wrangler >/dev/null 2>&1; then
  echo "wrangler CLI is required. Install via 'npm install -g wrangler' or 'pnpm add -g wrangler'." >&2
  exit 1
fi

pushd "$API_DIR" >/dev/null

run_cmd wrangler whoami
run_cmd wrangler d1 create secretforge-db --description "SecretForge production database" --json
run_cmd wrangler kv:namespace create SECRETS_VAULT --json
run_cmd wrangler vectorize create api-docs-index --metric cosine --dimensions 1536 --json

if [[ -n "${HYPERDRIVE_CONNECTION_STRING:-}" ]]; then
  run_cmd wrangler hyperdrive create secretforge-postgres --connection-string "$HYPERDRIVE_CONNECTION_STRING" --json
else
  echo "Skipping Hyperdrive creation (set HYPERDRIVE_CONNECTION_STRING to enable)." | tee -a "$LOG_FILE"
fi

run_cmd wrangler d1 execute secretforge-db --file=schema.sql

popd >/dev/null

echo "Provisioning complete. Copy the IDs from $LOG_FILE into packages/api/wrangler.toml."
