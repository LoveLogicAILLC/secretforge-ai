# Cloudflare Infrastructure Setup Guide

This guide explains how to set up the Cloudflare infrastructure required for SecretForge AI.

## Overview

SecretForge API runs on Cloudflare Workers and requires the following services:

1. **D1 Database** - SQLite database for metadata storage
2. **KV Namespace** - Key-Value store for encrypted secrets
3. **Vectorize** - Vector database for API documentation search
4. **Agents API** - Stateful AI agents with embedded SQLite
5. **Hyperdrive** - PostgreSQL connection pooling (optional)

## Prerequisites

- Cloudflare account (free tier works for development)
- Wrangler CLI installed: `npm install -g wrangler`
- Authenticated with Cloudflare: `wrangler login`

## Step 1: Create D1 Database

D1 is Cloudflare's serverless SQLite database for metadata storage.

### Create Database

```bash
cd /home/user/secretforge-ai/packages/api

# Create D1 database
wrangler d1 create secretforge-db

# Note the database ID from output:
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### Update wrangler.toml

Add the D1 binding to `packages/api/wrangler.toml`:

```toml
[[d1_databases]]
binding = "DATABASE"
database_name = "secretforge-db"
database_id = "YOUR_DATABASE_ID_HERE"  # From previous step
```

### Create Database Schema

Create `packages/api/schema.sql`:

```sql
-- Secrets metadata table
CREATE TABLE IF NOT EXISTS secrets (
  id TEXT PRIMARY KEY,
  service TEXT NOT NULL,
  environment TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_rotated TEXT,
  scopes TEXT, -- JSON array
  metadata TEXT -- JSON object
);

CREATE INDEX idx_secrets_user ON secrets(user_id);
CREATE INDEX idx_secrets_service ON secrets(service);
CREATE INDEX idx_secrets_env ON secrets(environment);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  secret_id TEXT,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL, -- 'create', 'read', 'rotate', 'delete'
  timestamp TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  metadata TEXT -- JSON object
);

CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_secret ON audit_log(secret_id);
CREATE INDEX idx_audit_timestamp ON audit_log(timestamp);

-- Users table (optional)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TEXT NOT NULL,
  last_login TEXT,
  settings TEXT -- JSON object
);

CREATE INDEX idx_users_email ON users(email);
```

### Apply Schema

```bash
# Execute schema
wrangler d1 execute secretforge-db --file=schema.sql

# Verify tables created
wrangler d1 execute secretforge-db --command="SELECT name FROM sqlite_master WHERE type='table'"
```

## Step 2: Create KV Namespaces

KV is used for storing encrypted API keys and cache data.

### Create KV Namespaces

```bash
# Production namespace for encrypted secrets
wrangler kv:namespace create "SECRETS_VAULT"

# Note the ID from output:
# id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Preview namespace for development
wrangler kv:namespace create "SECRETS_VAULT" --preview

# Note the preview ID from output
```

### Update wrangler.toml

Add KV bindings:

```toml
[[kv_namespaces]]
binding = "SECRETS_VAULT"
id = "YOUR_KV_ID_HERE"  # From production namespace
preview_id = "YOUR_PREVIEW_KV_ID_HERE"  # From preview namespace
```

### Test KV Access

```bash
# Write test value
wrangler kv:key put --namespace-id="YOUR_KV_ID" "test-key" "test-value"

# Read test value
wrangler kv:key get --namespace-id="YOUR_KV_ID" "test-key"

# Delete test value
wrangler kv:key delete --namespace-id="YOUR_KV_ID" "test-key"
```

## Step 3: Create Vectorize Index

Vectorize is used for semantic search of API documentation.

### Create Index

```bash
# Create Vectorize index
wrangler vectorize create secretforge-docs \
  --dimensions=1536 \
  --metric=cosine

# Note the index name: secretforge-docs
```

### Update wrangler.toml

Add Vectorize binding:

```toml
[[vectorize]]
binding = "VECTOR_DB"
index_name = "secretforge-docs"
```

### Populate Documentation Embeddings

Create a script to populate documentation embeddings:

```bash
# Example: Populate with API documentation
node scripts/populate-docs.js
```

Example `scripts/populate-docs.js`:

```javascript
import { OpenAI } from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const docs = [
  {
    service: "stripe",
    content: "Stripe API key provisioning...",
    url: "https://stripe.com/docs/keys"
  },
  // Add more documentation entries
];

for (const doc of docs) {
  // Generate embedding
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: doc.content
  });
  
  const embedding = response.data[0].embedding;
  
  // Insert into Vectorize (done via Worker API)
  console.log(`Processed: ${doc.service}`);
}
```

## Step 4: Configure Agents API

Cloudflare Agents API provides stateful AI agents with embedded SQLite.

### Update wrangler.toml

Add Agents binding:

```toml
[[agents]]
binding = "SECRET_AGENT"
type = "ai-agent"
```

**Note:** The Agents API is in beta. Check current status:
- Documentation: https://developers.cloudflare.com/workers/runtime-apis/agents/
- Availability: May require early access request

## Step 5: Set Environment Variables

Configure API keys and encryption keys as Workers secrets.

### Set Secrets

```bash
cd /home/user/secretforge-ai/packages/api

# Set OpenAI API key
wrangler secret put OPENAI_API_KEY
# Enter your OpenAI API key when prompted

# Set Anthropic API key
wrangler secret put ANTHROPIC_API_KEY
# Enter your Anthropic API key when prompted

# Set encryption key (generate a random 32-byte hex string)
openssl rand -hex 32
# Copy the output, then:
wrangler secret put ENCRYPTION_KEY
# Paste the generated key when prompted
```

### List Secrets

```bash
wrangler secret list
```

### Delete Secrets (if needed)

```bash
wrangler secret delete SECRET_NAME
```

## Step 6: Configure Hyperdrive (Optional)

Hyperdrive provides connection pooling for PostgreSQL databases.

### Create Hyperdrive Configuration

```bash
# Create Hyperdrive
wrangler hyperdrive create secretforge-db-pool \
  --connection-string="postgres://user:password@host:5432/database"

# Note the ID from output
```

### Update wrangler.toml

```toml
[[hyperdrive]]
binding = "HYPERDRIVE"
id = "YOUR_HYPERDRIVE_ID_HERE"
```

**Note:** Hyperdrive is optional. The API currently uses D1 for data storage.

## Step 7: Complete wrangler.toml

Here's a complete example `wrangler.toml`:

```toml
name = "secretforge-api"
main = "dist/index.js"
compatibility_date = "2024-01-01"
node_compat = true

# Environment variables (non-secret)
[vars]
ENVIRONMENT = "production"
API_VERSION = "v1"

# D1 Database
[[d1_databases]]
binding = "DATABASE"
database_name = "secretforge-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# KV Namespace
[[kv_namespaces]]
binding = "SECRETS_VAULT"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
preview_id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Vectorize Index
[[vectorize]]
binding = "VECTOR_DB"
index_name = "secretforge-docs"

# Agents API
[[agents]]
binding = "SECRET_AGENT"
type = "ai-agent"

# Routes (optional - for custom domains)
# routes = [
#   { pattern = "api.secretforge.ai/*", zone_name = "secretforge.ai" }
# ]
```

## Step 8: Deploy to Cloudflare

### Build and Deploy

```bash
cd /home/user/secretforge-ai/packages/api

# Install dependencies
pnpm install

# Build the worker
pnpm build

# Deploy to Cloudflare
wrangler deploy

# Note the deployment URL:
# Published secretforge-api
# https://secretforge-api.YOUR_SUBDOMAIN.workers.dev
```

### Test Deployment

```bash
# Test health endpoint
curl https://secretforge-api.YOUR_SUBDOMAIN.workers.dev/health

# Expected response:
# {"status":"healthy","timestamp":"2024-01-15T10:30:00.000Z"}
```

## Step 9: Set Up Development Environment

### Local Development

```bash
cd /home/user/secretforge-ai/packages/api

# Start local development server
wrangler dev --local

# Access at: http://localhost:8787
```

### Local Secrets

For local development, create `.dev.vars`:

```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
ENCRYPTION_KEY=your-32-byte-hex-key-here
```

**Important:** Add `.dev.vars` to `.gitignore`!

## Step 10: Configure Custom Domain (Optional)

### Add Custom Domain

```bash
# Add route to your zone
wrangler route create "api.secretforge.ai/*" \
  --worker=secretforge-api \
  --zone=secretforge.ai
```

### Update DNS

Add DNS records in Cloudflare dashboard:
- Type: AAAA
- Name: api
- Content: 100::
- Proxy: Enabled (orange cloud)

## Monitoring and Logs

### View Logs

```bash
# Tail logs in real-time
wrangler tail

# Filter by status
wrangler tail --status=error
```

### Analytics

Access analytics in Cloudflare dashboard:
- Workers & Pages → secretforge-api → Metrics

## Cost Estimation

### Free Tier Limits

- **Workers:** 100,000 requests/day
- **D1:** 5M rows read/day, 100K rows written/day
- **KV:** 100,000 reads/day, 1,000 writes/day
- **Vectorize:** 30M queried vectors/month, 5M uploaded vectors/month

### Paid Plans

For production workloads:
- **Workers Paid:** $5/month + $0.50/million requests
- **D1:** $5/month + usage-based pricing
- **KV:** $0.50 per million reads
- **Vectorize:** Usage-based pricing

## Security Checklist

- ✅ Set ENCRYPTION_KEY as a Workers secret (not in wrangler.toml)
- ✅ Use Workers secrets for API keys (OPENAI_API_KEY, ANTHROPIC_API_KEY)
- ✅ Enable CORS only for trusted domains
- ✅ Add rate limiting to prevent abuse
- ✅ Implement authentication for API endpoints
- ✅ Audit log all secret operations
- ✅ Rotate encryption keys periodically
- ✅ Use HTTPS only (enforced by Cloudflare)

## Troubleshooting

### Error: "wrangler: command not found"

```bash
npm install -g wrangler
```

### Error: "You must be logged in"

```bash
wrangler login
```

### Error: "Namespace not found"

Verify namespace ID in `wrangler.toml` matches the created namespace:
```bash
wrangler kv:namespace list
```

### Error: "D1 database not found"

Verify database ID in `wrangler.toml`:
```bash
wrangler d1 list
```

### Local Development Issues

Clear Wrangler cache:
```bash
rm -rf .wrangler
wrangler dev --local
```

## Next Steps

1. **Implement authentication** - Add user authentication (Auth0, Clerk, or custom)
2. **Add rate limiting** - Prevent API abuse
3. **Set up monitoring** - Configure alerts for errors and usage
4. **CI/CD pipeline** - Automate deployments with GitHub Actions
5. **Documentation** - API documentation with OpenAPI/Swagger
6. **Testing** - Integration tests for Workers endpoints

## Resources

- Cloudflare Workers: https://developers.cloudflare.com/workers/
- D1 Database: https://developers.cloudflare.com/d1/
- KV Storage: https://developers.cloudflare.com/kv/
- Vectorize: https://developers.cloudflare.com/vectorize/
- Agents API: https://developers.cloudflare.com/workers/runtime-apis/agents/
- Wrangler CLI: https://developers.cloudflare.com/workers/wrangler/

---

**Last Updated:** 2026-10-18
**Author:** Claude Code (Autonomous Development Agent)
