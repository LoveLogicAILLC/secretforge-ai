# SecretForge CLI

SecretForge is a secure, local-first secret management tool with encryption built-in.

## Features

- ✅ Local SQLite database for secret storage
- 🔒 AES-256-GCM encryption for all secrets
- 🔑 Environment-based secret management (dev, staging, prod)
- 🏷️ Tag-based organization
- 📦 Export secrets to various formats (env, json, yaml)
- 💉 Inject secrets into environment files

## Installation

```bash
pnpm add -D @secretforge/cli
```

Or use directly with npx:

```bash
npx @secretforge/cli@latest
```

## Quick Start

### 1. Initialize SecretForge

```bash
sf init
```

This will:

- Create a `.secretforge.json` configuration file
- Set up a local SQLite database
- Generate an encryption key (store this securely!)

### 2. Add Secrets

```bash
sf add API_KEY
```

Or specify environment directly:

```bash
sf add API_KEY --env prod
```

### 3. List Secrets

```bash
# List all secrets
sf list

# List secrets for a specific environment
sf list --env prod

# Filter by tags
sf list --tags api,external
```

### 4. Inject Secrets

Inject secrets into an environment file:

```bash
sf inject --env dev
# Creates .env.dev with decrypted secrets

sf inject --env prod --file .env.production
# Creates .env.production with decrypted secrets
```

### 5. Export Secrets

```bash
# Export as environment variables (default)
sf export --env prod

# Export as JSON
sf export --env prod --format json

# Export as YAML
sf export --env prod --format yaml
```

## CLI Commands

### `sf init`

Initialize SecretForge in the current project.

**Options:**

- Interactive prompts for project name and default environment

**Creates:**

- `.secretforge.json` - Project configuration
- SQLite database in `~/.secretforge/<project>.db`

### `sf add [NAME]`

Add a new secret interactively.

**Arguments:**

- `NAME` - Optional secret name (will prompt if not provided)

**Options:**

- `-e, --env <environment>` - Environment (dev/staging/prod)
- `-t, --tags <tags>` - Comma-separated tags

**Example:**

```bash
sf add STRIPE_API_KEY --env prod --tags payment,api
```

### `sf list`

List all secrets without exposing values.

**Options:**

- `-e, --env <environment>` - Filter by environment
- `-p, --project <project>` - Filter by project
- `-t, --tags <tags>` - Filter by tags (comma-separated)

**Example:**

```bash
sf list --env prod --tags api
```

### `sf inject`

Inject encrypted secrets into target files.

**Options:**

- `-e, --env <environment>` - **Required.** Environment to inject
- `-f, --file <file>` - Output file (default: `.env.<environment>`)

**Example:**

```bash
sf inject --env prod --file .env.production
```

### `sf export`

Export secrets in various formats.

**Options:**

- `-e, --env <environment>` - Filter by environment
- `-f, --format <format>` - Output format: env (default), json, yaml

**Example:**

```bash
sf export --env prod --format json > secrets.json
```

## Configuration

SecretForge stores its configuration in `.secretforge.json`:

```json
{
  "version": "1.0.0",
  "project": "my-project",
  "defaultEnvironment": "dev",
  "databasePath": "/Users/username/.secretforge/my-project.db"
}
```

## Security

### Encryption

All secrets are encrypted using **AES-256-GCM** with:

- Randomly generated 12-byte initialization vectors (IV)
- Authentication tags for integrity verification
- Base64 encoding for storage

### Encryption Key

The encryption key is stored in the `SECRETFORGE_ENCRYPTION_KEY` environment variable.

**Generate a new key:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Set the key:**

```bash
export SECRETFORGE_ENCRYPTION_KEY="your-base64-key-here"
```

⚠️ **Important:** Store this key securely! You cannot decrypt your secrets without it.

### Best Practices

1. **Never commit** `.secretforge.json` with sensitive data
2. **Store encryption keys** in a secure vault (1Password, AWS Secrets Manager, etc.)
3. **Rotate secrets** regularly
4. **Use environment-specific** secrets (dev, staging, prod)
5. **Tag secrets** for better organization and access control

## Database Schema

Secrets are stored in a SQLite database with the following schema:

```sql
CREATE TABLE secrets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  project TEXT NOT NULL,
  environment TEXT NOT NULL,
  tags TEXT NOT NULL,        -- JSON array
  value_encrypted TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(name, project, environment)
);
```

## Architecture

```
packages/cli/
├── src/
│   ├── crypto/
│   │   └── CryptoProvider.ts      # Encryption interface & implementation
│   ├── storage/
│   │   └── SecretStorage.ts       # SQLite storage layer
│   ├── cli/
│   │   └── ConfigManager.ts       # Configuration management
│   ├── commands/
│   │   ├── init.ts                # Initialize command
│   │   ├── add.ts                 # Add secret command
│   │   ├── list.ts                # List secrets command
│   │   ├── inject.ts              # Inject command
│   │   └── export.ts              # Export command
│   ├── sf.ts                      # CLI entry point
│   └── index.ts                   # Legacy entry point
└── __tests__/
    ├── crypto.test.ts             # Crypto tests
    └── storage.test.ts            # Storage tests
```

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage
pnpm test:coverage
```

## License

MIT
