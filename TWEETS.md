# 🚨 New: SecretForge AI

Stop committing API keys. Forever.

One command:
npx @secretforge/cli init

🔍 Detects: Stripe, OpenAI, AWS...
🔐 Provisions: Secure keys automatically
🔄 Rotates: AI-powered schedules
✅ Validates: SOC2, GDPR, HIPAA

Built with @Cloudflare Workers + AI Agents

Try it: secretforge.ai

[1/7]

---

I built an AI that stops you from committing API keys to GitHub.

The Problem:
- Bots scan GitHub 24/7 for exposed keys
- Average cost of leaked API key: $6,500
- It happens to everyone (even me, twice 😅)

[2/7]

---

What SecretForge Does:
1. Scans your package.json to detect required API services
2. Provisions secure keys with proper scopes
3. Catches leaked secrets in PRs (GitHub Action)
4. Works with Claude Code via Model Context Protocol

[3/7]

---

Tech Stack:
- Cloudflare Workers (edge-native)
- Cloudflare Agents (stateful AI with embedded SQLite)
- Next.js + Tailwind
- MCP integration

[4/7]

---

Why I Built This:
After the 3rd time seeing a $3k AWS bill from exposed credentials on a team repo, I had enough.

We need a way to manage secrets that is as easy as `npm install`.

[5/7]

---

It's open source and free to start.

Check it out: https://secretforge.ai
GitHub: https://github.com/secretforge/secretforge-ai

Would love your feedback!

[6/7]

---

P.S. If you use Claude or Cursor, you can install the MCP server to let your AI agent manage secrets for you:

npx @secretforge/mcp-server

[7/7]
