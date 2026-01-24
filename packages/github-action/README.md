# 🛡️ SecretForge Shield

**The GitHub Action that stops API key leaks before they happen.**

SecretForge Shield scans every pull request for exposed secrets and can automatically provision secure replacements. Never commit another API key again.

## ⚡ Quick Start

Add to `.github/workflows/security.yml`:

```yaml
name: SecretForge Shield
on: [pull_request]

jobs:
  scan-secrets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Scan for exposed secrets
        uses: secretforge/shield@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          fail-on-secrets: true
```

## 🚀 Features

- **🔍 AI-Powered Detection**: Catches Stripe, OpenAI, AWS, GitHub, and 50+ other API key formats
- **⚡ Auto-Provisioning**: Automatically provision secure replacements (optional)
- **💬 Smart Comments**: Clear, actionable PR comments with fix instructions
- **🎯 Zero False Positives**: Ignores `.env.example`, comments, and test fixtures
- **🌟 Beautiful UX**: Well-formatted tables and visual indicators

## 📖 Usage

### Basic Configuration

```yaml
- uses: secretforge/shield@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

### With Auto-Provisioning (Recommended)

```yaml
- uses: secretforge/shield@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    auto-provision: true
    secretforge-api-key: ${{ secrets.SECRETFORGE_API_KEY }}
```

### Warning Only (Don't Fail Build)

```yaml
- uses: secretforge/shield@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    fail-on-secrets: false
```

## 🎨 Example Output

When secrets are detected, SecretForge Shield leaves a comment like this:

```
⚠️ SecretForge Shield: Secrets Detected!

Found 2 exposed secrets in this PR.

🚨 Detected Secrets:
| File | Line | Type | Confidence |
|------|------|------|------------|
| src/config.ts | 12 | stripe | 90% |
| api/auth.ts | 45 | openai | 95% |

🛡️ Fix This Now:

Option 1: Auto-Fix (Recommended)
Enable auto-provisioning in your workflow

Option 2: Manual Fix
Use the SecretForge CLI: npx @secretforge/cli init
```

## 🔧 Configuration Options

| Input                 | Required | Default | Description                                 |
| --------------------- | -------- | ------- | ------------------------------------------- |
| `github-token`        | ✅       | -       | GitHub token for PR comments                |
| `auto-provision`      | ❌       | `false` | Automatically provision secure replacements |
| `secretforge-api-key` | ❌       | -       | API key for auto-provisioning               |
| `fail-on-secrets`     | ❌       | `true`  | Fail the check if secrets are found         |

## 🌟 Supported Secret Types

- **Payment**: Stripe (live & test), PayPal, Square
- **AI**: OpenAI, Anthropic Claude, Cohere, Hugging Face
- **Cloud**: AWS, Google Cloud, Azure
- **Auth**: GitHub, GitLab, Bitbucket tokens
- **Communication**: Twilio, SendGrid, Mailgun
- **Database**: MongoDB, PostgreSQL, MySQL connection strings
- **Generic**: Any `API_KEY=` pattern with 20+ character values

## 🚀 Get SecretForge

SecretForge Shield is part of the SecretForge AI ecosystem:

- **[CLI](https://www.npmjs.com/package/@secretforge/cli)**: `npx @secretforge/cli init`
- **[MCP Server](https://github.com/secretforge/mcp-server)**: Integrate with Claude & AI assistants
- **[Dashboard](https://secretforge.ai)**: Manage all your secrets in one place

## 💰 Pricing

- **Free**: Basic secret scanning (this GitHub Action)
- **Pro** ($29/mo): Auto-provisioning + compliance reports
- **Team** ($99/mo): Multi-environment + audit logs
- **Enterprise**: Custom pricing

[Start free →](https://secretforge.ai/pricing)

## 🤝 Contributing

Found a bug or want to add a secret pattern? PRs welcome!

```bash
git clone https://github.com/secretforge/shield
cd shield
pnpm install
pnpm build
```

## 📜 License

MIT © SecretForge AI

---

**Made with ❤️ by developers who are tired of .env files**

⭐ Star us on [GitHub](https://github.com/secretforge/secretforge-ai) if SecretForge saved your day!
