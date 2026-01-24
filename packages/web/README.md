# @secretforge/web

Next.js web dashboard for SecretForge AI secret management.

## Overview

Modern React-based dashboard for visualizing, managing, and interacting with secrets via AI chat interface.

## Features

- **Dashboard Overview**: Total secrets, pending rotations, security score
- **AI Chat Interface**: Real-time streaming conversations with SecretForge AI
- **Secret Management**: View, rotate, and manage API keys
- **Compliance Tracking**: Monitor security compliance across frameworks

## Development

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

## Build

```bash
pnpm build
pnpm start  # Production server
```

## Deployment

### Vercel

```bash
vercel deploy
```

### Cloudflare Pages

```bash
pnpm build
wrangler pages publish .next
```

## Environment Variables

Create `.env.local`:

```env
NEXT_PUBLIC_API_URL=https://api.secretforge.ai
NEXT_PUBLIC_AGENT_URL=https://agents.secretforge.ai
```

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **UI**: React 18, Tailwind CSS
- **Components**: shadcn/ui
- **AI Integration**: Cloudflare Agents React hooks
- **State**: React hooks

## Project Structure

```
web/
├── app/
│   ├── page.tsx          # Dashboard
│   ├── layout.tsx        # Root layout
│   └── globals.css       # Global styles
├── components/
│   └── ui/               # shadcn/ui components
└── public/               # Static assets
```
