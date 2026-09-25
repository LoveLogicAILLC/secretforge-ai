# @secretforge/cli

Command-line interface for SecretForge AI secret management.

## Overview

Interactive CLI powered by Ollama (Llama 3.1 70B) for natural language secret management, automatic service detection, and intelligent key provisioning.

## Installation

```bash
# Install globally
npm install -g @secretforge/cli

# Or use via npx
npx @secretforge/cli
```

## Commands

### Initialize Project

```bash
secretforge init
```

Analyzes `package.json`, detects required services, offers to provision keys.

### Request API Key

```bash
secretforge request <service> [options]

Options:
  -e, --env <environment>    Environment (dev/staging/prod) [default: dev]
  -s, --scopes <scopes...>   Permission scopes

Examples:
  secretforge request stripe --env prod --scopes read_write
  secretforge request openai --env dev
```

### Rotate Secret

```bash
secretforge rotate <secret-id>
```

### List Secrets

```bash
secretforge list
```

### Chat with AI

```bash
secretforge chat [message]

Examples:
  secretforge chat "How do I rotate Stripe keys?"
  secretforge chat  # Interactive mode
```

## Secret scanning

```bash
sf scan                      # working tree (respects .gitignore)
sf scan --staged             # only lines about to be committed
sf scan --history            # every line ever added, on every branch
sf scan --history --since "6 months ago"
sf scan --format sarif -o secretforge.sarif   # GitHub Code Scanning
sf scan --format json
sf hook install              # block commits that add secrets (husky-aware)
```

Exit codes: `0` clean, `1` findings at or above `--fail-on` (default `high`), `2` error.

**Adopting on an existing repo:** run `sf scan --history --update-baseline` once,
review `.secretforge-baseline.json` (fingerprints only, no secret values), rotate
anything real, and commit it. After that only *new* secrets fail the scan.
Suppress a single false positive inline with a `secretforge:allow` comment.

**GitHub Code Scanning:**

```yaml
- run: npx sf scan --format sarif -o secretforge.sarif --fail-on none
- uses: github/codeql-action/upload-sarif@v3
  with: { sarif_file: secretforge.sarif }
```

## Configuration

CLI stores config in `.secretforge.json`:

```json
{
  "projectPath": "/path/to/project",
  "dependencies": {...},
  "apiEndpoint": "https://api.secretforge.ai",
  "userId": "user-123"
}
```

## Environment Variables

- `SECRETFORGE_API` - API endpoint URL
- `SECRETFORGE_USER_ID` - User identifier
- `OLLAMA_HOST` - Ollama server URL (default: http://localhost:11434)

## Features

- **Auto-detection**: Scans `package.json` for required services
- **Natural Language**: Chat with AI assistant
- **Zero-config**: Minimal setup required
- **Auto-updates .env**: Provisions keys directly to `.env.local`

## Development

```bash
pnpm install
pnpm dev
pnpm build
```

## Supported Services

- Stripe
- OpenAI
- Anthropic
- AWS
- Supabase
- SendGrid
- Twilio
