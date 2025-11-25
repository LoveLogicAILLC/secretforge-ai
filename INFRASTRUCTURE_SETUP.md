# 🏗️ SecretForge AI - Infrastructure Setup Guide

## ✅ What You've Done So Far

Based on your terminal output:

1. ✅ **Logged in to Cloudflare** successfully
2. ⚠️ **D1 Database** - Already exists (need to get ID)
3. ❌ **KV Namespace** - Command syntax was incorrect
4. ✅ **Vectorize Index** - Created successfully: `api-docs-index`

---

## 🚨 Issues to Resolve

### 1. D1 Database Already Exists

The database `secretforge-db` already exists. To get its ID:

```bash
pnpm wrangler d1 list
```

Look for the output line with `secretforge-db` and copy the database ID.

### 2. KV Namespace Command Was Wrong

The correct syntax is:

```bash
pnpm wrangler kv namespace create SECRETS_VAULT
```

NOT:
```bash
pnpm wrangler kv:namespace create SECRETS_VAULT  # ❌ Wrong - has colon
```

---

## 🚀 Option 1: Automated Script (Recommended)

I've created an automated provisioning script for you:

```bash
cd /path/to/secretforge-ai
./provision-infrastructure.sh
```

This script will:
- ✅ Check your Cloudflare login
- ✅ Get or create D1 database
- ✅ Get or create KV namespace
- ✅ Verify Vectorize index
- ✅ Automatically update `wrangler.toml` with the correct IDs
- ✅ Give you next steps for schema and deployment

---

## 🛠️ Option 2: Manual Commands

If you prefer to do it manually:

### Step 1: Get D1 Database ID

```bash
pnpm wrangler d1 list
```

Copy the ID for `secretforge-db`. It will look like:
```
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### Step 2: Create KV Namespace

```bash
pnpm wrangler kv namespace create SECRETS_VAULT
```

This will output:
```
{ binding = "SECRETS_VAULT", id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }
```

Copy that ID.

### Step 3: Verify Vectorize Index

```bash
pnpm wrangler vectorize list
```

You should see `api-docs-index` in the list. ✅ Already created!

### Step 4: Update wrangler.toml

Edit `packages/api/wrangler.toml`:

```toml
[[d1_databases]]
binding = "DATABASE"
database_name = "secretforge-db"
database_id = "YOUR_COPIED_D1_ID"  # ← Replace with actual ID

[[kv_namespaces]]
binding = "SECRETS_VAULT"
id = "YOUR_COPIED_KV_ID"  # ← Replace with actual ID

[[vectorize]]
binding = "VECTOR_DB"
index_name = "api-docs-index"  # ← Already correct!
```

### Step 5: Apply Database Schema

```bash
pnpm wrangler d1 execute secretforge-db --file=packages/api/schema.sql
```

This creates all the tables, including the new `api_keys` table for authentication.

### Step 6: Deploy API

```bash
pnpm --filter @secretforge/api deploy
```

---

## 📋 Full Commands Summary

Here's the complete sequence you need:

```bash
# 1. Get D1 ID
pnpm wrangler d1 list

# 2. Create KV namespace (correct syntax)
pnpm wrangler kv namespace create SECRETS_VAULT

# 3. Update wrangler.toml with IDs from steps 1 & 2

# 4. Apply database schema
pnpm wrangler d1 execute secretforge-db --file=packages/api/schema.sql

# 5. Deploy API
pnpm --filter @secretforge/api deploy
```

---

## 🔍 Troubleshooting

### "Database already exists" error

This is fine! Just get the ID with:
```bash
pnpm wrangler d1 list
```

### KV namespace syntax error

Make sure you're using a space, not a colon:
- ✅ Correct: `kv namespace create`
- ❌ Wrong: `kv:namespace create`

### Wrangler version differences

Your output shows wrangler 4.48.0. The commands above are compatible with this version.

---

## 🎯 What's Next After Infrastructure Setup

Once your infrastructure is provisioned and the API is deployed:

1. **Test the API**
   ```bash
   curl https://your-worker-url.workers.dev/health
   ```

2. **Create your first API key**
   ```bash
   curl -X POST https://your-worker-url.workers.dev/api/auth/keys \
     -H "Content-Type: application/json" \
     -d '{"userId": "user-123", "name": "My First Key"}'
   ```

3. **Test authenticated endpoints**
   ```bash
   curl https://your-worker-url.workers.dev/api/analyze \
     -H "Authorization: Bearer YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"projectPath": "/test", "dependencies": {"stripe": "^12.0.0"}}'
   ```

---

## ✨ New Features Added

While you were setting up infrastructure, I added:

1. ✅ **Fixed GitHub Action build** - Now compiles successfully
2. ✅ **Added authentication middleware** - All API endpoints protected
3. ✅ **Created API key management** - `/api/auth/keys` endpoint
4. ✅ **Updated D1 schema** - New `api_keys` table added
5. ✅ **Authorization checks** - Users can only access their own secrets

---

## 🆘 Need Help?

If you run into issues, share the output of:

```bash
pnpm wrangler d1 list
pnpm wrangler kv namespace list
pnpm wrangler vectorize list
```

This will help diagnose any remaining configuration issues.
