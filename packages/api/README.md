# @secretforge/api

Cloudflare Workers-based API for SecretForge AI secret management platform.

## Overview

Edge-native API built with Hono framework, providing endpoints for secret management, AI agent interactions, documentation search, and compliance validation.

## Features

- **Secret Management**: CRUD operations for API keys
- **Encryption**: AES-GCM encryption at rest in KV
- **AI Agents**: Stateful conversational agents with embedded SQLite
- **Vector Search**: Semantic search for API documentation
- **Compliance**: SOC2, GDPR, HIPAA, PCI-DSS validation
- **Audit Logging**: Comprehensive operation tracking

## API Endpoints

### Health

- `GET /health` - Health check

### Analysis

- `POST /api/analyze` - Analyze project dependencies

### Secrets

- `POST /api/secrets` - Create secret
- `GET /api/secrets/:id` - Retrieve secret
- `POST /api/secrets/:id/rotate` - Rotate secret
- `GET /api/secrets/:id/validate` - Validate compliance

### Documentation

- `GET /api/docs/search` - Vector search API docs

### AI Agent

- `POST /api/agent/chat` - Chat with AI agent (SSE stream)

## Development

```bash
# Install dependencies
pnpm install

# Start local dev server
pnpm dev

# Build
pnpm build

# Deploy to Cloudflare
pnpm deploy
```

## Configuration

See `wrangler.toml` for Cloudflare bindings:

- D1 database (metadata)
- KV namespace (encrypted secrets)
- Vectorize index (documentation embeddings)
- Hyperdrive (PostgreSQL connection pooling)
- Agents (stateful AI)

## Database Schema

Run migrations:

```bash
pnpm wrangler d1 execute secretforge-db --file=schema.sql
```

## Environment Variables

Required secrets (set via `wrangler secret put`):

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `ENCRYPTION_KEY`

## Security

- All secrets encrypted with AES-GCM before KV storage
- 256-bit encryption key
- Random 12-byte IV per encryption
- Audit logs for all operations

## Testing

```bash
# Unit tests
pnpm test

# Integration tests
pnpm test:integration
```
