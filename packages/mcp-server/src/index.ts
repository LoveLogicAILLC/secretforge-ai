import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

interface SecretMetadata {
  service: string;
  environment: "dev" | "staging" | "prod";
  scopes: string[];
  created: string;
  lastRotated?: string;
}

interface MCPContext {
  projectPath: string;
  dependencies: Record<string, string>;
  envVars: Record<string, string>;
  gitRemote?: string;
}

const server = new Server(
  {
    name: "secretforge-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
      resources: {},
    },
  }
);

// Tool Schemas
const CreateSecretSchema = z.object({
  service: z.string(),
  environment: z.enum(["dev", "staging", "prod"]),
  scopes: z.array(z.string()).optional(),
});

const AnalyzeProjectSchema = z.object({
  projectPath: z.string(),
});

const RotateSecretSchema = z.object({
  secretId: z.string(),
});

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "analyze_project",
      description: "Analyzes a project directory to detect required API keys and services",
      inputSchema: {
        type: "object",
        properties: {
          projectPath: {
            type: "string",
            description: "Path to the project directory",
          },
        },
        required: ["projectPath"],
      },
    },
    {
      name: "create_secret",
      description: "Creates and provisions a new API key for a service",
      inputSchema: {
        type: "object",
        properties: {
          service: {
            type: "string",
            description: "Service name (e.g., 'stripe', 'openai', 'aws')",
          },
          environment: {
            type: "string",
            enum: ["dev", "staging", "prod"],
            description: "Environment for the key",
          },
          scopes: {
            type: "array",
            items: { type: "string" },
            description: "Permission scopes for the key",
          },
        },
        required: ["service", "environment"],
      },
    },
    {
      name: "rotate_secret",
      description: "Rotates an existing API key",
      inputSchema: {
        type: "object",
        properties: {
          secretId: {
            type: "string",
            description: "ID of the secret to rotate",
          },
        },
        required: ["secretId"],
      },
    },
    {
      name: "search_documentation",
      description: "Searches API documentation for a service",
      inputSchema: {
        type: "object",
        properties: {
          service: {
            type: "string",
            description: "Service name to search documentation for",
          },
          query: {
            type: "string",
            description: "Search query",
          },
        },
        required: ["service", "query"],
      },
    },
    {
      name: "validate_security",
      description: "Validates security compliance for a secret",
      inputSchema: {
        type: "object",
        properties: {
          secretId: {
            type: "string",
            description: "ID of the secret to validate",
          },
          framework: {
            type: "string",
            enum: ["SOC2", "GDPR", "HIPAA", "PCI_DSS"],
            description: "Compliance framework to validate against",
          },
        },
        required: ["secretId", "framework"],
      },
    },
  ],
}));

// Tool execution handlers
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "analyze_project": {
        const { projectPath } = AnalyzeProjectSchema.parse(args);
        const analysis = await analyzeProject(projectPath);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(analysis, null, 2),
            },
          ],
        };
      }

      case "create_secret": {
        const data = CreateSecretSchema.parse(args);
        const secret = await createSecret(data);
        return {
          content: [
            {
              type: "text",
              text: `Secret created successfully: ${(secret as any).id}`,
            },
          ],
        };
      }

      case "rotate_secret": {
        const { secretId } = RotateSecretSchema.parse(args);
        await rotateSecret(secretId);
        return {
          content: [
            {
              type: "text",
              text: `Secret ${secretId} rotated successfully`,
            },
          ],
        };
      }

      case "search_documentation": {
        const { service, query } = args as { service: string; query: string };
        const results = await searchDocumentation(service, query);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case "validate_security": {
        const { secretId, framework } = args as { secretId: string; framework: string };
        const validation = await validateSecurity(secretId, framework);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(validation, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
      isError: true,
    };
  }
});

// List available prompts
server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [
    {
      name: "provision_api_key",
      description: "Intelligent API key provisioning workflow",
      arguments: [
        {
          name: "service",
          description: "Service requiring API key",
          required: true,
        },
        {
          name: "context",
          description: "Project context",
          required: false,
        },
      ],
    },
    {
      name: "security_audit",
      description: "Comprehensive security audit for secrets",
      arguments: [
        {
          name: "scope",
          description: "Audit scope (project, organization, service)",
          required: true,
        },
      ],
    },
  ],
}));

// Prompt execution
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "provision_api_key":
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Provision API key for ${args?.service}. Context: ${JSON.stringify(args?.context || {})}`,
            },
          },
        ],
      };

    case "security_audit":
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Perform security audit for scope: ${args?.scope}`,
            },
          },
        ],
      };

    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
});

// Helper functions
async function analyzeProject(projectPath: string): Promise<MCPContext> {
  const fs = await import("fs/promises");
  const path = await import("path");

  const packageJsonPath = path.join(projectPath, "package.json");
  let dependencies = {};

  try {
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));
    dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  } catch {}

  // Detect required services from dependencies
  const detectedServices = detectServices(dependencies);

  return {
    projectPath,
    dependencies,
    envVars: {},
    gitRemote: await getGitRemote(projectPath),
  };
}

function detectServices(dependencies: Record<string, string>): string[] {
  const serviceMap: Record<string, string[]> = {
    stripe: ["stripe", "@stripe/stripe-js"],
    openai: ["openai", "@openai/api"],
    aws: ["aws-sdk", "@aws-sdk/client-s3"],
    supabase: ["@supabase/supabase-js"],
    anthropic: ["@anthropic-ai/sdk"],
  };

  const detected: string[] = [];
  for (const [service, packages] of Object.entries(serviceMap)) {
    if (packages.some((pkg) => pkg in dependencies)) {
      detected.push(service);
    }
  }
  return detected;
}

async function getGitRemote(projectPath: string): Promise<string | undefined> {
  try {
    const { execSync } = await import("child_process");
    return execSync("git remote get-url origin", { cwd: projectPath })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

async function createSecret(data: z.infer<typeof CreateSecretSchema>) {
  // Integrate with Cloudflare Workers API
  const response = await fetch("http://localhost:8787/api/secrets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  return response.json();
}

async function rotateSecret(secretId: string) {
  await fetch(`http://localhost:8787/api/secrets/${secretId}/rotate`, {
    method: "POST",
  });
}

async function searchDocumentation(service: string, query: string) {
  const response = await fetch(
    `http://localhost:8787/api/docs/search?service=${service}&q=${encodeURIComponent(query)}`
  );
  return response.json();
}

async function validateSecurity(secretId: string, framework: string) {
  const response = await fetch(
    `http://localhost:8787/api/secrets/${secretId}/validate?framework=${framework}`
  );
  return response.json();
}

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SecretForge MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
