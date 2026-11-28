# Publishing to npm

This guide covers publishing the SecretForge packages that are meant for npm. Run every command from
the repository root.

## What gets published

| Package                    | Published | Notes                                                        |
| -------------------------- | --------- | ------------------------------------------------------------ |
| `@secretforge/shared`      | Yes       | Runtime dependency of the CLI, so it **must go out first**   |
| `@secretforge/cli`         | Yes       | Requires Node.js `>=22.12.0`                                 |
| `@secretforge/mcp-server`  | Yes       | Requires Node.js `>=18`                                      |
| `@secretforge/api`         | No        | `"private": true`; a Cloudflare Worker, see below            |
| `@secretforge/lsp-server`  | No        | Not part of the current release set                          |
| `secretforge-ai` (VS Code) | No        | `"private": true`; packaged as a `.vsix`, not an npm package |

The API is deployed with `wrangler`, not npm. See [`CLOUDFLARE_SETUP.md`](CLOUDFLARE_SETUP.md).

## Prerequisites

- Node.js 22.12+ and `pnpm@8.15.0` (pinned in `package.json`).
- An npm account that **owns, or is a member of, the `@secretforge` npm organization**. A personal
  account cannot publish `@secretforge/*` packages unless its username is `secretforge`. Create the
  organization at <https://www.npmjs.com/org/create>, or rename the packages to a scope you control.
- Two-factor authentication enabled on that account.

```bash
npm login
npm whoami
```

## Before every release

1. **Bump the versions** in each package's `package.json`. npm rejects a version that has already been
   published, and a git tag does not change `package.json`, so tagging alone republishes the old
   version and fails. Keep `CLI_VERSION` in `packages/cli/src/commands/scan.ts` in step with the CLI
   version.
2. Update [`CHANGELOG.md`](CHANGELOG.md).
3. Verify from a clean install:

```bash
pnpm install --frozen-lockfile
pnpm --filter @secretforge/shared --filter @secretforge/cli --filter @secretforge/mcp-server build
pnpm --filter @secretforge/shared --filter @secretforge/cli --filter @secretforge/mcp-server test
```

4. Check what each tarball contains. Every package must list a regular `LICENSE` file (npm drops
   symlinks that point outside the package, so do not symlink it):

```bash
(cd packages/shared && npm pack --dry-run)
(cd packages/cli && npm pack --dry-run)
(cd packages/mcp-server && npm pack --dry-run)
```

## Publish

Use `pnpm publish`, not `npm publish`. pnpm rewrites the CLI's `"@secretforge/shared": "workspace:*"`
dependency to the real version number; `npm publish` would ship the unresolvable `workspace:*`
specifier.

Publish in dependency order. `--access public` is required for the first publish of any scoped
package, including from a paid organization:

```bash
pnpm --filter @secretforge/shared publish --access public
pnpm --filter @secretforge/cli publish --access public
pnpm --filter @secretforge/mcp-server publish --access public
```

Verify:

```bash
npm view @secretforge/cli version
npx --package @secretforge/cli sf --help
```

## Automating with GitHub Actions (example)

This is an example, not a committed workflow. Store an npm automation token as the `NPM_TOKEN`
repository secret. The job builds and tests only the packages being published (the API is excluded)
and uses the pnpm version pinned in `package.json`.

```yaml
name: Publish
on:
  push:
    tags: ['v*']

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4 # reads packageManager from package.json (pnpm@8.15.0)
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @secretforge/shared --filter @secretforge/cli --filter @secretforge/mcp-server build
      - run: pnpm --filter @secretforge/shared --filter @secretforge/cli --filter @secretforge/mcp-server test
      - run: pnpm --filter @secretforge/shared publish --access public --no-git-checks
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      - run: pnpm --filter @secretforge/cli publish --access public --no-git-checks
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      - run: pnpm --filter @secretforge/mcp-server publish --access public --no-git-checks
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Bump the package versions and merge to `main` **before** pushing the tag.

## Troubleshooting

| Symptom                                         | Cause and fix                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------- |
| `E403 ... cannot publish over previous version` | The version was not bumped. Bump `package.json` and retry.                      |
| `E404 ... @secretforge/shared`                  | `shared` was not published first, or the account lacks access to the org scope. |
| `E402 ... requires you to pay`                  | Scoped package published without `--access public`.                             |
| `Unsupported engine` on install                 | Node.js is older than the package's `engines.node`.                             |
| Installed CLI reports `workspace:*` errors      | Published with `npm publish`. Republish a new version with `pnpm publish`.      |
