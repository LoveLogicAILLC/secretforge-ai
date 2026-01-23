# SecretForge AI Deployment Runbook

Last updated: 2025-10-06

This guide covers the full production deployment workflow for the SecretForge AI API (Cloudflare Workers) and the web dashboard (Vercel). All commands assume you run them from the repository root unless otherwise noted.

## 1. Prerequisites

- Cloudflare account with Workers, D1, KV, Vectorize, and Hyperdrive access
- Cloudflare API token with the following scopes:
  - `Account.Cloudflare Workers Scripts`
  - `Account.Cloudflare Workers KV Storage`
  - `Account.Cloudflare Workers Vectorize`
  - `Account.Cloudflare D1`
  - `Account.Workers R2 Storage` (if Hyperdrive or object storage used)
- Vercel account (production project created)
- npm (or pnpm via `corepack`)
- Optional: Stripe / additional integrations for paid tiers

## 2. Environment Setup

1. Copy the production template:
   ```bash
   cp infrastructure/production/.env.production.template .env.production
   ```
2. Fill in all required fields (use `docs/deployment/secretforge-config-checklist.md` as a guide) and export any secrets you do not want stored on disk.
3. Copy `.env.production` to `.env` if you want local commands to reuse the values.
4. Authenticate Wrangler:
   ```bash
   npx wrangler login
   ```
5. Link the project:
   ```bash
   cd packages/api
   wrangler whoami
   ```

## 3. Provision Cloudflare Resources

Use the helper script to provision resources:

```bash
./scripts/cloudflare/provision_resources.sh --dry-run  # review commands
HYPERDRIVE_CONNECTION_STRING="postgres://..." ./scripts/cloudflare/provision_resources.sh
```

The script captures Wrangler output in `infrastructure/production/cloudflare-provision-*.log`.

With each run, copy the returned IDs into the corresponding sections of `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DATABASE"
database_id = "xxxxxxxxxxxxxxxxxxxx"

[[kv_namespaces]]
binding = "SECRETS_VAULT"
id = "xxxxxxxxxxxxxxxxxxxx"

[[vectorize]]
binding = "VECTOR_DB"
index_name = "api-docs-index"

[[hyperdrive]]
binding = "HYPERDRIVE"
id = "xxxxxxxxxxxxxxxxxxxx"
```

Finally, seed the database:

```bash
wrangler d1 execute secretforge-db --file=schema.sql
```

## 4. Set Secrets

Use the helper script to push secrets:

```bash
OPENAI_API_KEY="sk-..." \
ANTHROPIC_API_KEY="sk-ant-..." \
ENCRYPTION_KEY="$(openssl rand -base64 32)" \
./scripts/cloudflare/set_secrets.sh --dry-run

OPENAI_API_KEY="sk-..." \
ANTHROPIC_API_KEY="sk-ant-..." \
ENCRYPTION_KEY="..." \
./scripts/cloudflare/set_secrets.sh
```

To target a different environment, set `CLOUDFLARE_ENV=staging`.

## 5. Build and Deploy API

Execute the combined deployment script:

```bash
./scripts/deploy/deploy_all.sh --dry-run
./scripts/deploy/deploy_all.sh
```

Confirm deployment:

```bash
wrangler deployments list
wrangler tail --env production
curl https://secretforge-api-production.<account>.workers.dev/health
```

## 6. Deploy Web Dashboard

If you prefer manual deploys:

```bash
pnpm --filter @secretforge/web build
cd packages/web
vercel --prod
```

Ensure `NEXT_PUBLIC_API_URL` is set to the production API endpoint.

## 7. GitHub Actions Secrets

Add the following secrets to the repository or organization:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `ENCRYPTION_KEY`
- `NEXT_PUBLIC_API_URL`
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `NPM_TOKEN` (for CLI publishing when `workflow_dispatch` triggered)

## 8. Domain Configuration

1. In Cloudflare, create a Workers Route for `api.secretforge.ai` pointing to the Worker.
2. In Vercel, add the custom domain `secretforge.ai` and set `www` and apex records.
3. Update DNS:
   - `api.secretforge.ai` → Cloudflare Worker route (CNAME to `workers.dev` hostname or use Cloudflare pages routing)
   - `secretforge.ai` / `www.secretforge.ai` → Vercel IP / CNAME as provided.

## 9. Post-Deployment Checklist

- [ ] `curl https://api.secretforge.ai/health` returns `200`
- [ ] Web dashboard loads via `https://secretforge.ai`
- [ ] CLI configured to hit production API (`SECRETFORGE_API`)
- [ ] AI endpoints (OpenAI / Anthropic) respond successfully
- [ ] Rotation and compliance jobs scheduled
- [ ] Analytics & logging (Wrangler tail / Logpush) verified

## 10. Rollback Plan

- Use `wrangler deployments rollback <deployment-id>` for the API.
- For Vercel, redeploy previous build via dashboard or `vercel rollback`.
- Keep database migrations reversible. Snapshot D1 via `wrangler d1 export`.

---

Maintain this runbook alongside `agent.md` and update after each production change.
