# NPM Publishing Guide

This guide explains how to publish SecretForge packages to npm.

## Packages Ready for Publishing

The following packages are configured and ready for npm publishing:

1. **@secretforge/cli** - AI-powered CLI for secret management
2. **@secretforge/mcp-server** - Model Context Protocol server
3. **@secretforge/api** - Cloudflare Workers API (pending TypeScript fixes)

## Prerequisites

Before publishing, ensure you have:

1. **npm account** - Create one at https://www.npmjs.com/signup
2. **npm authentication** - Run `npm login` to authenticate
3. **Organization access** (optional) - For scoped packages like `@secretforge/*`, you need:
   - Either: Publish under your personal namespace (no org needed)
   - Or: Create an npm organization at https://www.npmjs.com/org/create
   - Or: Request access to existing `@secretforge` organization

## Pre-Publishing Checklist

### 1. Build All Packages

```bash
cd /home/user/secretforge-ai
pnpm install
pnpm build
```

**Current Status:**
- ✅ CLI builds successfully
- ✅ MCP Server builds successfully
- ❌ API has TypeScript errors (needs fixing before publishing)
- ❌ Web package has certificate issues (not for npm publishing)

### 2. Run Tests

```bash
pnpm test
```

Ensure all tests pass before publishing.

### 3. Verify Package Contents

Test what will be included in each package:

```bash
# CLI
cd packages/cli
npm pack --dry-run

# MCP Server
cd packages/mcp-server
npm pack --dry-run
```

The output shows exactly what files will be included in the published package.

### 4. Test Local Installation

Create actual tarballs and test installation:

```bash
# Create tarballs
cd packages/cli
npm pack
# Creates: secretforge-cli-1.0.0.tgz

cd packages/mcp-server
npm pack
# Creates: secretforge-mcp-server-1.0.0.tgz

# Test installation in a separate directory
cd /tmp
mkdir test-install
cd test-install
npm init -y
npm install /home/user/secretforge-ai/packages/cli/secretforge-cli-1.0.0.tgz

# Test the CLI works
npx secretforge --help
```

## Publishing Process

### Option 1: Manual Publishing (Recommended for First Release)

#### Step 1: Authenticate with npm

```bash
npm login
```

Enter your npm credentials when prompted.

#### Step 2: Publish CLI Package

```bash
cd /home/user/secretforge-ai/packages/cli

# First publish (v1.0.0)
npm publish --access public

# The --access public flag is required for scoped packages (@secretforge/*)
# unless you have a paid npm organization
```

#### Step 3: Publish MCP Server Package

```bash
cd /home/user/secretforge-ai/packages/mcp-server
npm publish --access public
```

#### Step 4: Verify Publication

Check that packages are published:
- https://www.npmjs.com/package/@secretforge/cli
- https://www.npmjs.com/package/@secretforge/mcp-server

### Option 2: Automated Publishing with GitHub Actions

Create `.github/workflows/publish.yml`:

```yaml
name: Publish to npm

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: pnpm/action-setup@v2
        with:
          version: 10
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Build packages
        run: pnpm build
      
      - name: Run tests
        run: pnpm test
      
      - name: Publish packages
        run: |
          cd packages/cli && npm publish --access public
          cd ../mcp-server && npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**Setup:**
1. Generate npm token: https://www.npmjs.com/settings/YOUR_USERNAME/tokens
2. Add token to GitHub Secrets: Settings → Secrets → Actions → New repository secret
3. Name: `NPM_TOKEN`
4. Value: Your npm token

**Usage:**
```bash
# Tag a release
git tag v1.0.0
git push origin v1.0.0

# GitHub Actions will automatically publish
```

## Version Management

### Updating Versions

Use npm's version command to bump versions:

```bash
# Patch release (1.0.0 → 1.0.1)
cd packages/cli
npm version patch

# Minor release (1.0.0 → 1.1.0)
npm version minor

# Major release (1.0.0 → 2.0.0)
npm version major
```

This automatically:
- Updates `package.json` version
- Creates a git commit
- Creates a git tag

### Monorepo Version Sync

To keep all package versions in sync, use a tool like `changeset`:

```bash
pnpm add -D -w @changesets/cli
pnpm changeset init
```

## Post-Publishing

### 1. Verify Installation

Test that users can install your packages:

```bash
npm install -g @secretforge/cli
npm install @secretforge/mcp-server
```

### 2. Update Documentation

Update README files with installation instructions:

```bash
npm install -g @secretforge/cli
```

### 3. Create GitHub Release

Create a release on GitHub with:
- Release notes
- Changelog
- Links to npm packages

### 4. Announce Release

Consider announcing on:
- Project README
- GitHub Discussions
- Twitter/X
- Product Hunt
- Relevant communities

## Troubleshooting

### Error: "You do not have permission to publish"

**Solution:** Add `--access public` flag:
```bash
npm publish --access public
```

### Error: "Package name too similar to existing package"

**Solution:** Use a different package name or prefix:
```bash
# In package.json
"name": "@your-username/secretforge-cli"
```

### Error: "Version already published"

**Solution:** Bump the version:
```bash
npm version patch
npm publish --access public
```

### Error: "npm ERR! 403 Forbidden"

**Solutions:**
1. Verify you're logged in: `npm whoami`
2. Re-authenticate: `npm login`
3. Check organization access (for scoped packages)

## Package Metadata Checklist

All packages should have:

- ✅ `name` - Unique package name
- ✅ `version` - Semantic version (1.0.0)
- ✅ `description` - Clear, concise description
- ✅ `keywords` - Searchable keywords
- ✅ `author` - Package author
- ✅ `license` - Open source license (MIT)
- ✅ `repository` - GitHub repository URL
- ✅ `bugs` - GitHub issues URL
- ✅ `homepage` - Package homepage/README
- ✅ `files` - Files to include in package
- ✅ `engines` - Node.js version requirement
- ✅ `bin` - Executable commands (CLI only)
- ✅ `main` - Entry point

## Next Steps for API Package

Before publishing the API package:

1. **Fix TypeScript compilation errors:**
   - Fix type assertions for `unknown` types
   - Fix `getState()` → `this.state` in Agent class
   - Fix spread operator type errors

2. **Update wrangler.toml** - Ensure Cloudflare configuration is documented

3. **Add deployment guide** - Document how to deploy to Cloudflare Workers

## Security Considerations

1. **Never commit npm tokens** to git
2. **Use scoped packages** (`@secretforge/*`) to prevent name squatting
3. **Enable 2FA** on npm account
4. **Review published files** before publishing (use `npm pack --dry-run`)
5. **Don't publish secrets** - Ensure `.env` files are in `.gitignore` and `.npmignore`

## Resources

- npm Documentation: https://docs.npmjs.com/
- Semantic Versioning: https://semver.org/
- npm Package Scope: https://docs.npmjs.com/cli/v9/using-npm/scope
- Publishing Scoped Packages: https://docs.npmjs.com/creating-and-publishing-scoped-public-packages

---

**Last Updated:** 2026-10-18
**Author:** Claude Code (Autonomous Development Agent)
