# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+
- Docker and Docker Compose (for local services)
- Git

### Getting Started

1. Clone the repository

```bash path=/Users/RemyMorgan-Jones/secretforge-ai/WARP.md start=16
git clone https://github.com/yourusername/secretforge-ai.git
```

2. Install dependencies

```bash path=/Users/RemyMorgan-Jones/secretforge-ai/WARP.md start=22
pnpm install
```

3. Copy environment variables

```bash path=/Users/RemyMorgan-Jones/secretforge-ai/WARP.md start=28
cp .env.example .env
```

4. Start local services

```bash path=/Users/RemyMorgan-Jones/secretforge-ai/WARP.md start=34
docker compose up -d
```

5. Run development servers

```bash path=/Users/RemyMorgan-Jones/secretforge-ai/WARP.md start=40
pnpm dev
```

## Common Development Commands

- `pnpm install` – install dependencies
- `./setup.sh` – run setup script
- `pnpm dev` – start all services in development
- `pnpm dev --filter packages/cli` – start CLI only
- `pnpm dev --filter packages/api` – start API only
- `pnpm dev --filter packages/web` – start web dashboard
- `pnpm dev --filter packages/mcp-server` – start MCP server
- `pnpm build` – build all packages
- `pnpm lint` – lint all packages
- `pnpm test` – run all tests
- `pnpm test -- path/to/specific.test.ts` – run a single test file
- `pnpm clean` – clear cache and build artifacts
- `docker compose down` – stop local services

## Architecture Overview

**Monorepo Structure**  
This is a Turborepo-based monorepo with these packages:

- **packages/cli**: Command-line interface for SecretForge
- **packages/api**: Cloudflare Workers API for secrets management and AI
- **packages/web**: Next.js dashboard for web UI
- **packages/mcp-server**: Model Context Protocol server integration
- **packages/shared**: Shared utilities and types

**Core Dependencies & Environment Variables**

- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `ENCRYPTION_KEY`, `SECRETFORGE_API` for AI
- `DATABASE_URL` for relational storage (SQLite/D1 or external)
- `REDIS_URL` for caching/state

**Turborepo Pipeline**  
Defined in `turbo.json`, with tasks:

- **build**: compile TypeScript and bundle outputs
- **dev**: run dev servers (no cache)
- **lint**: run ESLint
- **test**: run tests and output coverage

## Key Configuration & Workflows

- **Husky**: `.husky/` for Git hooks (pre-commit, commit-msg)
- **commitlint**: `commitlint.config.js` for Conventional Commits
- **lint-staged**: `.lintstagedrc.json` for staged-file linting
- **.env.example**: template for environment variables
- **pnpm-workspace.yaml**: workspace definition
- **turbo.json**: Turborepo build graph and env settings
- **packages/api/wrangler.toml**: Cloudflare Workers config
- **packages/web/next.config.js**: Next.js settings
