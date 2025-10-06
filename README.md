# 🛡️ SecretForge AI

<div align="center">

![SecretForge Banner](https://img.shields.io/badge/AI--Powered-Secret%20Management-purple?style=for-the-badge)
[![npm version](https://img.shields.io/npm/v/@secretforge/cli?style=for-the-badge)](https://www.npmjs.com/package/@secretforge/cli)
[![GitHub stars](https://img.shields.io/github/stars/secretforge/secretforge-ai?style=for-the-badge)](https://github.com/secretforge/secretforge-ai)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)

### Stop Committing API Keys Forever

**One command. Zero exposed secrets.**

[Get Started](#quick-start) • [Documentation](#documentation) • [Discord](https://discord.gg/secretforge) • [Twitter](https://twitter.com/SecretForgeAI)

</div>

---

## ⚡ What is SecretForge?

SecretForge AI is an **AI-powered secret management platform** that automatically:

- 🔍 **Detects** required API keys from your project dependencies
- 🔐 **Provisions** secure keys with optimal scopes
- 🔄 **Rotates** keys based on AI-powered schedules
- 🛡️ **Catches** exposed secrets in PRs before they hit production
- ✅ **Validates** compliance (SOC2, GDPR, HIPAA, PCI-DSS)

**Built with:** Cloudflare Workers + AI Agents + Model Context Protocol

## Features

- **🤖 AI-Powered Detection**: Automatically detects required API services from project dependencies
- **🔐 Zero-Config Provisioning**: Intelligent key generation with minimal configuration
- **🔄 Automatic Rotation**: Scheduled and policy-based key rotation
- **✅ Compliance Validation**: SOC2, GDPR, HIPAA, PCI-DSS compliance checking
- **🌍 Edge-Native**: Built on Cloudflare Workers for global low-latency
- **💬 Natural Language Interface**: Chat with AI assistant via CLI or web dashboard
- **📚 Documentation Search**: Vector-based semantic search for API documentation
- **🔍 MCP Integration**: Seamless integration with Claude Code and MCP-compatible AI tools

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     SecretForge AI                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  MCP Server  │  │     CLI      │  │  Web Dashboard│     │
│  │  (Claude)    │  │   (Ollama)   │  │   (Next.js)   │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬────────┘     │
│         │                 │                 │              │
│         └─────────────────┴─────────────────┘              │
│                           │                                │
│                  ┌────────▼────────┐                       │
│                  │  Cloudflare API  │                       │
│                  │  (Hono/Workers)  │                       │
│                  └────────┬─────────┘                       │
│                           │                                │
│         ┌─────────────────┼─────────────────┐              │
│         │                 │                 │              │
│    ┌────▼────┐      ┌─────▼─────┐     ┌────▼─────┐        │
│    │   D1    │      │    KV     │     │Vectorize │        │
│    │(SQLite) │      │(Secrets)  │     │  (Docs)  │        │
│    └─────────┘      └───────────┘     └──────────┘        │
│                                                             │
│    ┌──────────────────────────────────────────┐            │
│    │      Cloudflare Agents (Stateful AI)     │            │
│    │   GPT-4o • Embedded SQLite • State Mgmt  │            │
│    └──────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- **Node.js** 20+
- **pnpm** 8+
- **Cloudflare Account** (for deployment)
- **Ollama** (optional, for local CLI AI)
- **OpenAI/Anthropic API Keys** (for AI features)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/secretforge-ai.git
cd secretforge-ai

# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env

# Configure environment variables
# Edit .env with your API keys

# Run setup script
bash setup.sh
```

### Development

```bash
# Start all services
pnpm dev

# Start specific package
pnpm --filter @secretforge/cli dev
pnpm --filter @secretforge/api dev
pnpm --filter @secretforge/web dev

# Build all packages
pnpm build

# Run tests
pnpm test

# Lint
pnpm lint
```

### Using Docker Compose

```bash
# Start all services (Ollama, Miniflare, PostgreSQL, Redis)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Project Structure

```
secretforge-ai/
├── packages/
│   ├── api/              # Cloudflare Workers API
│   │   ├── src/
│   │   │   └── index.ts  # Hono API, Agents, endpoints
│   │   ├── schema.sql    # D1 database schema
│   │   └── wrangler.toml # Cloudflare configuration
│   │
│   ├── cli/              # Command-line interface
│   │   └── src/
│   │       └── index.ts  # Commander CLI, Ollama integration
│   │
│   ├── mcp-server/       # Model Context Protocol server
│   │   └── src/
│   │       └── index.ts  # MCP tools & prompts
│   │
│   ├── web/              # Next.js dashboard
│   │   └── app/
│   │       └── page.tsx  # React UI
│   │
│   └── shared/           # Shared utilities (future)
│
├── .github/              # CI/CD workflows
├── docs/                 # Documentation
├── infrastructure/       # IaC configs
├── docker-compose.yml    # Local development environment
├── turbo.json            # Turborepo configuration
└── package.json          # Monorepo root
```

## Usage

### CLI

```bash
# Initialize project
secretforge init

# Request API key
secretforge request stripe --env prod --scopes read_write

# Rotate existing key
secretforge rotate secret-id-123

# List all keys
secretforge list

# Chat with AI assistant
secretforge chat "How do I rotate my Stripe keys?"
```

### MCP Server (Claude Code)

Add to your Claude Code MCP settings:

```json
{
  "mcpServers": {
    "secretforge": {
      "command": "npx",
      "args": ["-y", "@secretforge/mcp-server"]
    }
  }
}
```

Use in Claude:
- "Analyze my project and detect required API keys"
- "Provision a Stripe API key for production"
- "Validate my secrets for SOC2 compliance"

### Web Dashboard

```bash
cd packages/web
pnpm dev
```

Visit `http://localhost:3000` to access the dashboard.

## Configuration

### Cloudflare Setup

```bash
# Login to Cloudflare
pnpm wrangler login

# Create D1 database
pnpm wrangler d1 create secretforge-db

# Apply schema
pnpm wrangler d1 execute secretforge-db --file=packages/api/schema.sql

# Create KV namespace
pnpm wrangler kv:namespace create SECRETS_VAULT

# Create Vectorize index
pnpm wrangler vectorize create api-docs-index --dimensions=1536 --metric=cosine

# Deploy
pnpm --filter @secretforge/api deploy
```

### Environment Variables

See `.env.example` for full list. Key variables:

- `OPENAI_API_KEY`: OpenAI API key for embeddings & AI
- `ANTHROPIC_API_KEY`: Anthropic API key for Claude
- `ENCRYPTION_KEY`: 32-byte encryption key (generate with `openssl rand -base64 32`)
- `SECRETFORGE_API`: API endpoint URL

## Security

- **Encryption**: AES-GCM 256-bit encryption for all secrets at rest
- **Zero-Knowledge**: Secrets encrypted before storage, decrypted on-demand
- **Audit Logging**: All operations logged with IP, user agent, timestamp
- **Compliance**: Built-in validation for SOC2, GDPR, HIPAA, PCI-DSS
- **Rotation Policies**: Configurable automatic rotation schedules

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | TypeScript, Node.js 20+ |
| Monorepo | Turborepo |
| API | Hono, Cloudflare Workers |
| Storage | D1 (SQLite), KV, Vectorize |
| AI/LLM | OpenAI GPT-4o, Ollama (Llama 3.1) |
| MCP | @modelcontextprotocol/sdk |
| CLI | Commander, Inquirer, Chalk, Ora |
| Web | Next.js 14, React, Tailwind CSS |
| Agents | Cloudflare Agents API |

## Roadmap

- [ ] OAuth2 integration for major providers
- [ ] Browser extension for 1-click key injection
- [ ] Slack/Discord bot for ChatOps
- [ ] Terraform/Pulumi provider
- [ ] GitHub Actions integration
- [ ] Key usage analytics & anomaly detection
- [ ] Multi-tenant support
- [ ] SSO/SAML for enterprise

## Contributing

Contributions welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

```bash
# Fork the repo
git checkout -b feature/your-feature

# Make changes and test
pnpm test

# Commit and push
git commit -m "Add your feature"
git push origin feature/your-feature

# Open a pull request
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/secretforge-ai/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/secretforge-ai/discussions)
- **Email**: support@secretforge.ai

## Acknowledgments

Built with:
- [Cloudflare Workers](https://workers.cloudflare.com/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Anthropic Claude](https://www.anthropic.com/)
- [OpenAI](https://openai.com/)
- [Ollama](https://ollama.ai/)

---

**Made with ❤️ by the SecretForge team**
