#!/bin/bash
# setup.sh

echo "🚀 Setting up SecretForge AI..."

# Install dependencies
pnpm install

# Setup Cloudflare Workers
cd packages/api
pnpm wrangler d1 create secretforge-db
pnpm wrangler vectorize create api-docs-index --dimensions=1536 --metric=cosine
pnpm wrangler kv:namespace create SECRETS_VAULT

# Build all packages
cd ../..
pnpm build

# Start local Ollama
ollama pull llama3.1:70b

echo "✅ Setup complete! Run 'pnpm dev' to start"
