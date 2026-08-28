# SecretForge AI — Language Server

Secret detection and AI-assisted remediation for any LSP-compatible editor.

One server, every editor: VS Code, Cursor, Neovim, Emacs, Helix, Sublime Text.

## What it does

- **Detects credentials as you type** — 18 provider-specific patterns (AWS, Stripe, OpenAI, Anthropic, GitHub, Google, Slack, SendGrid, Twilio, private keys) plus entropy-gated generic rules.
- **Fixes them in one keystroke** — swap the literal for `process.env.*`, provision a managed key, or run an AI compliance check.
- **Explains the risk on hover** — service, severity, and remediation, with the value masked.
- **Completes credential env vars** — triggered inside `process.env.`, `os.environ[`, `os.getenv(`, and `ENV[`.

Detection runs entirely locally. The backend is only needed for provisioning and AI validation, so an unreachable API degrades those actions without disabling the linting.

## False positives

Two gates keep the generic rules quiet:

1. **Placeholder filter** — skips `your-api-key`, `changeme`, `example`, `xxxxx`, and similar.
2. **Entropy gate** — generic matches must exceed 3.0 bits/char of Shannon entropy, so `api_key: "aaaaaaaaaaaaaaaaaaaa"` is ignored while a real random token is not.

Provider-prefixed keys (`AKIA…`, `sk_live_…`, `ghp_…`) are self-identifying and bypass the entropy gate.

Overlapping matches resolve to the most specific pattern, so an Anthropic key reports once as `sk-ant-…` rather than also matching the generic OpenAI rule.

## Install

```bash
npm install -g @secretforge/lsp-server
```

The binary is `secretforge-lsp`, speaking LSP over stdio.

### Neovim

```lua
vim.lsp.config.secretforge = {
  cmd = { 'secretforge-lsp', '--stdio' },
  filetypes = { 'javascript', 'typescript', 'python', 'go', 'ruby', 'php', 'java' },
  root_markers = { '.git' },
  init_options = {
    apiUrl = 'https://secretforge-ai.workers.dev',
  },
}
vim.lsp.enable('secretforge')
```

### VS Code / Cursor

Install the **SecretForge AI** extension — it bundles this server.

## Configuration

Passed through LSP `initializationOptions`:

| Option | Default | Purpose |
| --- | --- | --- |
| `apiUrl` | `https://secretforge-ai.workers.dev` | Backend endpoint |
| `apiKey` | — | Bearer token for AI-backed actions |
| `enableDiagnostics` | `true` | Inline secret detection |
| `enableHover` | `true` | Hover details |
| `enableAutocomplete` | `true` | Env var completions |
| `enableCodeActions` | `true` | Quick fixes |

## Commands

| Command | Arguments |
| --- | --- |
| `secretforge.provision` | `uri`, `range`, `service` |
| `secretforge.validate` | `secret` |
| `secretforge.rotate` | `service` |
| `secretforge.askAI` | `question` |

## Develop

```bash
pnpm --filter @secretforge/lsp-server build
pnpm --filter @secretforge/lsp-server watch
pnpm --filter @secretforge/lsp-server test
```

### Why there is no checked-in fixture

Testing a secret scanner needs realistic, high-entropy credentials — and a file
full of those is indistinguishable from a real leak. Committing one trips GitHub
push protection and every scanner pointed at this repository.

So `test/fixture.ts` generates them at runtime from a fixed seed. The suite
feeds the text straight to `textDocument/didOpen`, which carries document
content in the request, so the server never reads from disk and nothing
credential-shaped is ever written to the working tree.

To eyeball diagnostics in an editor, paste a generated value into a scratch
file — `test/sample.local.*` is gitignored for exactly this.

---

Built by LoveLogicAI LLC
