# Cloudflare setup

How to stand up the SecretForge API (`packages/api`) on your own Cloudflare account. Run commands
from the repository root. The Worker's configuration is [`packages/api/wrangler.jsonc`](packages/api/wrangler.jsonc).

> The resource IDs committed in `wrangler.jsonc` belong to the maintainers' account. Create your own
> resources below and replace the IDs before deploying to a different account.

## Prerequisites

- A Cloudflare account with Workers, D1, KV, and Vectorize available.
- Node.js 22.12+ and `pnpm@8.15.0`, then `pnpm install --frozen-lockfile`.
- Authenticate wrangler (a workspace dev dependency of the API):

```bash
pnpm --filter @secretforge/api exec wrangler login
```

## Bindings the Worker expects

| Binding         | Type           | Name / class        | Purpose                     |
| --------------- | -------------- | ------------------- | --------------------------- |
| `DATABASE`      | D1             | `secretforge-db`    | Metadata, audit logs, users |
| `SECRETS_VAULT` | KV             | any                 | Encrypted secret values     |
| `RATE_LIMIT_KV` | KV             | any                 | Rate-limit counters         |
| `VECTOR_DB`     | Vectorize      | `api-docs-index`    | API documentation search    |
| `SECRET_AGENT`  | Durable Object | class `SecretAgent` | Stateful AI agent           |

## 1. Create the resources

```bash
pnpm --filter @secretforge/api exec wrangler d1 create secretforge-db
pnpm --filter @secretforge/api exec wrangler kv namespace create SECRETS_VAULT
pnpm --filter @secretforge/api exec wrangler kv namespace create RATE_LIMIT_KV
pnpm --filter @secretforge/api exec wrangler vectorize create api-docs-index --dimensions=1536 --metric=cosine
```

The Vectorize index uses 1536 dimensions because the Worker embeds queries with OpenAI
`text-embedding-3-small`. Copy the IDs that wrangler prints into `packages/api/wrangler.jsonc`
(`d1_databases[].database_id`, `kv_namespaces[].id`).

## 2. Register the Durable Object

`SECRET_AGENT` is a Durable Object binding, not an `ai-agent` type. It needs the binding **and** the
migration that creates its SQLite storage. Both are already in `wrangler.jsonc`; keep them if you
edit the file:

```jsonc
"durable_objects": {
  "bindings": [{ "name": "SECRET_AGENT", "class_name": "SecretAgent" }]
},
"migrations": [{ "tag": "v1", "new_sqlite_classes": ["SecretAgent"] }]
```

## 3. Apply the database schema

The checked-in schema is `packages/api/schema.sql`. Apply that file rather than writing your own;
table and column names must match what the Worker queries. It already includes the `api_secrets`,
`api_audit_logs` and `api_compliance_validations` tables (also present in
`packages/api/migrations/0002_api_secrets.sql`, using `IF NOT EXISTS`).

```bash
cd packages/api
pnpm exec wrangler d1 execute secretforge-db --remote --file=schema.sql
```

## 4. Set secrets

Secrets are set with `wrangler secret put` and never committed. Use your own generated values.

| Secret                                    | How to generate             | Notes                                                                             |
| ----------------------------------------- | --------------------------- | --------------------------------------------------------------------------------- |
| `ENCRYPTION_KEY`                          | `openssl rand -base64 32`   | **Must be base64 and decode to exactly 32 bytes.**                                |
| `JWT_SECRET`                              | `openssl rand -base64 32`   | Signs session JWTs.                                                               |
| `API_KEY_SALT`                            | `openssl rand -base64 32`   | Optional. Declared in the Worker's `Env` type but not read by current code paths. |
| `OPENAI_API_KEY`                          | From your OpenAI account    | Query embeddings and AI features.                                                 |
| `ANTHROPIC_API_KEY`                       | From your Anthropic account | AI agent.                                                                         |
| `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET` | From Stripe                 | Only if you enable billing.                                                       |

`ENCRYPTION_KEY` is validated whenever a secret is encrypted or decrypted: a value that is not
base64 for exactly 32 bytes (for example the 64 hex characters from `openssl rand -hex 32`) is
rejected, so secret creation and retrieval fail.

```bash
cd packages/api
openssl rand -base64 32 | pnpm exec wrangler secret put ENCRYPTION_KEY
openssl rand -base64 32 | pnpm exec wrangler secret put JWT_SECRET
pnpm exec wrangler secret put OPENAI_API_KEY
pnpm exec wrangler secret put ANTHROPIC_API_KEY
```

**Back up `ENCRYPTION_KEY` in a password manager.** Losing it makes every stored secret
unrecoverable.

## 5. Deploy and verify

```bash
pnpm --filter @secretforge/api run deploy
curl https://<your-worker>.workers.dev/health
```

Local development uses `pnpm --filter @secretforge/api dev` with variables in
`packages/api/.dev.vars` (git-ignored).

## Documentation search needs data

Nothing in the Worker writes to the `VECTOR_DB` index; `/api/docs/search` only queries it, filtering
on a `service` metadata field. The endpoint returns no matches until you load vectors yourself:
1536-dimension embeddings with `{ "service": "<name>" }` metadata, for example via
`wrangler vectorize insert api-docs-index --file=vectors.ndjson`.

## Security controls in the current API

These are implemented in `packages/api/src`; confirm them against your deployment:

- **Authentication:** signed JWTs on `/api/secrets*` routes (`middleware/auth.ts`).
- **Rate limiting:** tier-based limits using `RATE_LIMIT_KV` (`middleware/rateLimit.ts`).
- **Audit logging:** create, retrieve, rotate and delete are written to the audit table.
- **Encryption:** AES-GCM envelope encryption of values before they reach KV.
- **CORS:** a **hard-coded origin allowlist** in `middleware/errorHandler.ts` (`corsMiddleware`).
  If you serve a frontend from another domain, add it there; browsers from other origins are not
  granted access.

See [`SECURITY_AND_VERIFICATION.md`](SECURITY_AND_VERIFICATION.md) for the verification results.
Review Cloudflare's current [pricing](https://developers.cloudflare.com/workers/platform/pricing/)
for Workers, D1, KV, Vectorize and Durable Objects before enabling production traffic.
