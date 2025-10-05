# @secretforge/mcp-server

Model Context Protocol (MCP) server for SecretForge AI integration with Claude Code and other MCP-compatible AI tools.

## Overview

Exposes SecretForge capabilities as MCP tools and prompts, enabling AI assistants to analyze projects, provision secrets, and perform security audits.

## Installation

```bash
npm install -g @secretforge/mcp-server
```

## MCP Configuration

Add to Claude Code settings (`.claude/mcp.json`):

```json
{
  "mcpServers": {
    "secretforge": {
      "command": "secretforge-mcp",
      "args": []
    }
  }
}
```

## Available Tools

### analyze_project
Analyzes project directory to detect required API keys.

**Input:**
```json
{
  "projectPath": "/path/to/project"
}
```

**Output:**
```json
{
  "projectPath": "/path/to/project",
  "dependencies": {...},
  "detectedServices": ["stripe", "openai"],
  "gitRemote": "https://github.com/user/repo"
}
```

### create_secret
Creates and provisions a new API key.

**Input:**
```json
{
  "service": "stripe",
  "environment": "prod",
  "scopes": ["read_write"]
}
```

### rotate_secret
Rotates an existing API key.

**Input:**
```json
{
  "secretId": "secret-123"
}
```

### search_documentation
Searches API documentation for a service.

**Input:**
```json
{
  "service": "stripe",
  "query": "webhook signatures"
}
```

### validate_security
Validates security compliance for a secret.

**Input:**
```json
{
  "secretId": "secret-123",
  "framework": "SOC2"
}
```

## Available Prompts

### provision_api_key
Intelligent API key provisioning workflow.

**Arguments:**
- `service` (required): Service requiring API key
- `context` (optional): Project context

### security_audit
Comprehensive security audit for secrets.

**Arguments:**
- `scope` (required): Audit scope (project, organization, service)

## Usage with Claude

```
User: Analyze my project and detect required API keys
Claude: [Uses analyze_project tool]

User: Provision a Stripe API key for production
Claude: [Uses create_secret tool with service="stripe", environment="prod"]

User: Validate my secrets for SOC2 compliance
Claude: [Uses validate_security tool with framework="SOC2"]
```

## Configuration

Set environment variables:
- `SECRETFORGE_API` - API endpoint URL (default: http://localhost:8787)

## Development

```bash
pnpm install
pnpm dev
pnpm build
```

## Testing

```bash
# Test MCP server
pnpm start

# In another terminal, use MCP inspector
npx @modelcontextprotocol/inspector secretforge-mcp
```
