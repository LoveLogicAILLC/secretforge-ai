# AGENTS.md

Guidance for AI coding agents and human contributors working in this repository.

The authoritative rules live in [`.github/instructions/`](.github/instructions/) and
[`CONTRIBUTING.md`](CONTRIBUTING.md). This file summarizes what matters most; if the two ever
disagree, those documents win.

## Ground rules

- **Security first.** Never commit plaintext secrets, keys, tokens, or URLs containing credentials.
  Never invent credentials. Secrets belong in `.env.local` (git-ignored) or GitHub Actions
  encrypted secrets. Do not log sensitive values.
- **No telemetry, no unexplained external scripts, no unjustified dependencies.** Anything that
  sends data off the machine, downloads and runs remote code, or adds a dependency needs an explicit
  explanation in the PR.
- **Do not upload private data** to third-party services.
- **Do not delete existing logic** unless explicitly asked, and **never push breaking changes to
  `main`**.
- Explain any migration, schema change, or config shift in the PR description.

## Workflow

- Use `pnpm@8.15.0` (pinned in `package.json`) and Node.js 22.12+.
- Branch names: `feat/<name>`, `fix/<name>`, `ops/<name>`. Open a PR against `main`.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat`, `fix`,
  `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `revert`, `ci`, `build`), header up to
  100 characters, one logical change per commit (`commitlint.config.js`).
- Use the PR template in `.github/pull_request_template.md`.

## Before opening a PR

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm test
```

All three must pass. Add or update unit tests for new modules and behavior changes.

## Code style

- TypeScript with `strict` enabled; ES modules, named exports, async/await.
- Validate external input (Zod where applicable) and handle errors explicitly.
- Prettier formats the code (`.prettierrc.json`); ESLint enforces quality (`.eslintrc.json`).
- Test fixtures that need credential-shaped strings must generate them at runtime rather than
  committing them (see `packages/lsp-server/test/fixture.ts`).
