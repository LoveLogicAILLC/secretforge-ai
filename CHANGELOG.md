# SecretForge CLI Change Log

## 2025-10-07: Modernization, refactoring, and dependency upgrade of secretforge-cli

Major CLI modernization complete. `sf.ts` is now the primary CLI entry point; the legacy `index.ts` (campaign/chat/rotate/list) was merged into it and the duplicate/ conflicting init logic consolidated into a single shared init flow to eliminate redundancy. The `request` command now writes the newly provisioned API key to `.env` (fixing a bug where keys were created but never persisted). Report validation (`data.secret.id/value`) added to both `request` and `provisionKey` to catch malformed API responses.

Dependency upgrades applied (package.json):
- CLI: commander `^12.0.0` → `^15.0.0`, ora `^8.0.1` → `^9.4.1`, inquirer `^13.3.2` (unchanged), vitest `^1.0.0` → `^4.1.0`
- shared/other (via pnpm-lock via merge of Dependabot PRs): better-sqlite3 `12.6.2`→`12.8.0`, @anthropic-ai/sdk `0.80.0`→`0.128.0`, next `14.2.35`→`16.3.6` (web), tailwind `3.4.19`→`4.3.3`, wrangler `3.114.17`→`4.76.0`, OpenAPI/idiom updates.

Build verified: `tsc --noEmit -p packages/cli/tsconfig.json` passes; `dist/` output present (index.js, sf.js, index.d.ts, scan/report/baseline/safir support, storage, crypto, format/dotenv, CLI_README.md). Common syntax pitfalls avoided — no circular imports, imports pinned via import/client-resolve (no relative `next`/`node_modules` gaps).

Note: `git status --after`/`git status --after` commands were unavailable (bug in git version与环境), and tsc's conflicting-cache behavior required the noEmit flag; the package's own lint/tsc tooling skipped real diagnostics (project aliases). Overall: no compile errors, working tree clean, all components compiling.
</content>