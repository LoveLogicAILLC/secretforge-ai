# Changelog

All notable changes to this repository are documented in this file.

## Unreleased

### Added

- `@secretforge/lsp-server`: a Language Server Protocol server that detects hard-coded secrets in
  any LSP-capable editor (diagnostics, quick fixes, hover, env-var completion), plus the
  `secretforge-ai` VS Code extension that bundles it.
- `AGENTS.md`: a short guide to this repository's rules for AI agents and contributors.
- `NPM_PUBLISHING_GUIDE.md` and `CLOUDFLARE_SETUP.md`: publishing and Cloudflare deployment guides,
  verified against the current code.
- npm metadata (description, keywords, license, repository, `files`) and a regular `LICENSE` file for
  `@secretforge/shared`, `@secretforge/cli` and `@secretforge/mcp-server`. `@secretforge/shared` is a
  runtime dependency of the CLI, so it must be published first.

### Changed

- **Breaking:** the CLI now requires Node.js `>=22.12.0` (`commander@15`). `ora@9` requires
  Node.js 20 or newer. The README and `WARP.md` prerequisites were updated to match.
- CLI dependency upgrades: `commander` `^12.0.0` to `^15.0.0`, `ora` `^8.0.1` to `^9.4.1`,
  `vitest` and `@vitest/coverage-v8` `^1.0.0` to `^4.1.0`. `@types/inquirer` was removed because
  `inquirer@13` ships its own types.
- The CLI's `add` command uses the `select` prompt type for the environment choice
  (the `list` type was renamed in `inquirer@13`).

### Fixed

- `secretforge request` and the `init` provisioning flow validate the API response, report HTTP
  failures, and stop the spinner on error. They no longer write the API's `[ENCRYPTED]`
  placeholder into `.env.local` as if it were a credential.
- `.env.local` is the file the provisioned key is written to; the success message now says so.
- The MCP server's `create_secret` tool reads the new secret's ID from `response.secret.id`; it
  previously reported `undefined`. HTTP failures are now surfaced.
- `pnpm deploy` is a pnpm built-in and fails for the API package; the docs now use
  `pnpm run deploy`.

### Security

- `@secretforge/api` is marked `"private": true` so the Cloudflare Worker cannot be published to npm
  by accident; it is deployed with `wrangler`.

### Known limitations

- The legacy `secretforge` binary (`packages/cli/src/index.ts`: `chat`, `request`, `rotate`,
  `list`) does not send credentials, so against the authenticated API its provisioning commands
  fail with an HTTP 401 until CLI authentication is added. The `sf` binary (`init`, `add`, `list`,
  `inject`, `export`, `scan`, `hook`) works against the local vault and is unaffected.
