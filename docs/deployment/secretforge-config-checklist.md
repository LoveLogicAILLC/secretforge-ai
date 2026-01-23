# SecretForge Production Configuration Checklist

Use this list to gather every credential before running the deployment scripts.

| Field | Description | Where to Get It |
| --- | --- | --- |
| `OPENAI_API_KEY` | Production OpenAI API token with required model access | https://platform.openai.com |
| `ANTHROPIC_API_KEY` | Production Anthropic API key | https://console.anthropic.com |
| `ENCRYPTION_KEY` | 32-byte base64 string for encrypting stored secrets | `openssl rand -base64 32` |
| `CLOUDFLARE_ACCOUNT_ID` | Account UUID | `wrangler whoami` |
| `CLOUDFLARE_API_TOKEN` | API token with Workers, KV, Vectorize, D1 scopes | Cloudflare dashboard → My Profile → API Tokens |
| `D1_DATABASE_ID` | ID returned by `wrangler d1 create secretforge-db` | Cloudflare CLI output |
| `KV_NAMESPACE_ID` | ID returned by `wrangler kv:namespace create SECRETS_VAULT` | Cloudflare CLI output |
| `VECTORIZE_INDEX_ID` | Index name/ID returned by `wrangler vectorize create api-docs-index` | Cloudflare CLI output |
| `HYPERDRIVE_ID` | Optional: ID returned by `wrangler hyperdrive create ...` | Cloudflare CLI output |
| `NEXT_PUBLIC_API_URL` | Public API URL (e.g. https://api.secretforge.ai) | DNS setup |
| `NEXT_PUBLIC_AGENT_URL` | Same as API URL unless agents exposed separately | DNS setup |
| `VERCEL_TOKEN` | Personal deploy token | Vercel dashboard → Account Settings → Tokens |
| `VERCEL_ORG_ID` | Organization ID | Vercel dashboard → Settings → General |
| `VERCEL_PROJECT_ID` | Project ID for SecretForge web | Vercel dashboard → Project Settings |
| `NPM_TOKEN` | Automation token to publish CLI | npmjs.com settings |

After collecting values:

1. Copy `infrastructure/production/.env.production.template` to `.env.production` and fill it out.
2. Update `packages/api/wrangler.toml` with the resource IDs.
3. Add the GitHub repository secrets listed above.
