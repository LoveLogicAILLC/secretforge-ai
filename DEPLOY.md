# Deployment & Publishing Guide

## 1. Publish Packages to npm

Ensure you are logged in to npm:

```bash
npm login
```

Publish the packages:

```bash
# Publish Shared
cd packages/shared
npm publish --access public

# Publish CLI
cd ../cli
npm publish --access public

# Publish MCP Server
cd ../mcp-server
npm publish --access public
```

## 2. Deploy Web App (Landing Page)

The web app is a Next.js application located in `packages/web`.

### Vercel (Recommended)

1. Install Vercel CLI: `npm i -g vercel`

1. Run deployment from root:

   ```bash
   vercel packages/web
   ```

1. Configure build settings if prompted:

   - Framework: Next.js
   - Build Command: `next build` (or `pnpm build` if using pnpm)
   - Output Directory: `.next`

### Cloudflare Pages

1. Connect your GitHub repository to Cloudflare Pages.

1. Configure build settings:

   - Framework: Next.js
   - Build command: `npx @cloudflare/next-on-pages` (requires adapter)
   - Output directory: `.vercel/output/static`

## 3. GitHub Action

The GitHub Action is located in `packages/github-action`.
To release a new version:

1. Build the action:

   ```bash
   cd packages/github-action
   pnpm build
   ```

1. Commit the `dist` folder.

1. Tag the release:

   ```bash
   git tag -a v1 -m "Release v1"
   git push origin v1
   ```

## 4. Launch Checklist

- [ ] CLI published to npm
- [ ] Landing page deployed and accessible at <https://secretforge.ai>
- [ ] Demo video recorded and embedded
- [ ] Twitter thread posted (see TWEETS.md)
- [ ] Product Hunt launch scheduled
