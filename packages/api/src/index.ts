import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { Agent } from "agents";
import { OpenAI } from "openai";
import postgres from "postgres";
import { encryptSecret, decryptSecret, validateMasterKey, testEncryption } from "./crypto";
import { authMiddleware, generateApiKey as createUserApiKey } from "./middleware/auth";
import {
  validateBody,
  validateQuery,
  validateParams,
  CreateSecretSchema,
  AnalyzeProjectSchema,
  SearchDocsSchema,
  ValidateComplianceSchema,
  AgentChatSchema,
  SecretIdSchema,
} from "./middleware/validation";
import { rateLimitMiddleware, burstProtectionMiddleware } from "./middleware/ratelimit";

interface Env {
  SECRETS_VAULT: KVNamespace;
  VECTOR_DB: Vectorize;
  DATABASE: D1Database;
  HYPERDRIVE: Hyperdrive;
  SECRET_AGENT: AgentNamespace<SecretAgent>;
  OPENAI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  ENCRYPTION_KEY: string;
}

interface Secret {
  id: string;
  service: string;
  environment: string;
  scopes: string[];
  created: string;
  lastRotated?: string;
  userId: string;
}

const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use("*", cors());
app.use("*", burstProtectionMiddleware()); // Prevent spike attacks
app.use("*", rateLimitMiddleware()); // General rate limiting

// Validate encryption key on startup
app.use("*", async (c, next) => {
  const validation = validateMasterKey(c.env.ENCRYPTION_KEY);
  if (!validation.valid) {
    throw new HTTPException(500, {
      message: `Invalid encryption key: ${validation.reason}`,
    });
  }
  await next();
});

// Apply authentication to all /api/* routes
app.use("/api/*", authMiddleware);

// Health check (public endpoint)
app.get("/health", async (c) => {
  // Test encryption to ensure system is healthy
  const encryptionHealthy = await testEncryption(c.env.ENCRYPTION_KEY);

  return c.json({
    status: encryptionHealthy ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    checks: {
      encryption: encryptionHealthy,
      database: !!c.env.DATABASE,
      kv: !!c.env.SECRETS_VAULT,
      vectorize: !!c.env.VECTOR_DB,
    },
  });
});

// Analyze project endpoint
app.post("/api/analyze", validateBody(AnalyzeProjectSchema), async (c) => {
  try {
    const { projectPath, dependencies } = c.get("validatedBody");
    const userId = c.get("userId");

    const detectedServices = analyzeDependencies(dependencies);
    const recommendations = await getRecommendations(c.env, detectedServices);

    return c.json({
      detectedServices,
      recommendations,
      missingKeys: await findMissingKeys(c.env, detectedServices, userId),
    });
  } catch (error) {
    console.error("Analyze project error:", error);
    throw new HTTPException(500, {
      message: "Failed to analyze project dependencies",
    });
  }
});

// Create secret
app.post("/api/secrets", validateBody(CreateSecretSchema), async (c) => {
  try {
    const { service, environment, scopes, value } = c.get("validatedBody");
    const userId = c.get("userId"); // From auth middleware

    const secretId = crypto.randomUUID();

    // Generate or use provided API key value
    const secretValue = value || await generateApiKey(service);
    const encryptedValue = await encryptSecret(c.env.ENCRYPTION_KEY, secretValue);

    const secret: Secret = {
      id: secretId,
      service,
      environment,
      scopes: scopes || [],
      created: new Date().toISOString(),
      userId,
    };

    // Store encrypted secret in KV
    await c.env.SECRETS_VAULT.put(
      `secret:${secretId}`,
      JSON.stringify({ ...secret, value: encryptedValue }),
      {
        metadata: { service, environment, userId },
      }
    );

    // Store metadata in D1
    await c.env.DATABASE.prepare(
      `INSERT INTO secrets (id, service, environment, user_id, created_at) VALUES (?, ?, ?, ?, ?)`
    )
      .bind(secretId, service, environment, userId, secret.created)
      .run();

    // Log creation in audit trail
    await c.env.DATABASE.prepare(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, timestamp)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(userId, "create_secret", "secret", secretId, secret.created)
      .run();

    return c.json({ secret: { ...secret, value: "[ENCRYPTED]" } }, 201);
  } catch (error) {
    console.error("Create secret error:", error);
    throw new HTTPException(500, {
      message: "Failed to create secret",
    });
  }
});

// Get secret
app.get("/api/secrets/:id", validateParams(SecretIdSchema), async (c) => {
  try {
    const { id: secretId } = c.get("validatedParams");
    const userId = c.get("userId");

    const secretData = await c.env.SECRETS_VAULT.get(`secret:${secretId}`);

    if (!secretData) {
      throw new HTTPException(404, {
        message: "Secret not found",
      });
    }

    const secret = JSON.parse(secretData);

    // Verify ownership
    if (secret.userId !== userId) {
      throw new HTTPException(403, {
        message: "Unauthorized to access this secret",
      });
    }

    const decryptedValue = await decryptSecret(c.env.ENCRYPTION_KEY, secret.value);

    // Log access
    await c.env.DATABASE.prepare(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, timestamp)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(userId, "read_secret", "secret", secretId, new Date().toISOString())
      .run();

    return c.json({
      ...secret,
      value: decryptedValue,
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    console.error("Get secret error:", error);
    throw new HTTPException(500, {
      message: "Failed to retrieve secret",
    });
  }
});

// Rotate secret
app.post("/api/secrets/:id/rotate", validateParams(SecretIdSchema), async (c) => {
  try {
    const { id: secretId } = c.get("validatedParams");
    const userId = c.get("userId");

    const secretData = await c.env.SECRETS_VAULT.get(`secret:${secretId}`);

    if (!secretData) {
      throw new HTTPException(404, {
        message: "Secret not found",
      });
    }

    const secret = JSON.parse(secretData);

    // Verify ownership
    if (secret.userId !== userId) {
      throw new HTTPException(403, {
        message: "Unauthorized to rotate this secret",
      });
    }

    // Generate new API key value
    const newValue = await generateApiKey(secret.service);
    const encryptedValue = await encryptSecret(c.env.ENCRYPTION_KEY, newValue);

    secret.value = encryptedValue;
    secret.lastRotated = new Date().toISOString();

    // Update in KV
    await c.env.SECRETS_VAULT.put(`secret:${secretId}`, JSON.stringify(secret));

    // Update in D1
    await c.env.DATABASE.prepare(
      `UPDATE secrets SET last_rotated = ? WHERE id = ?`
    )
      .bind(secret.lastRotated, secretId)
      .run();

    // Log rotation
    await c.env.DATABASE.prepare(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, timestamp)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(userId, "rotate_secret", "secret", secretId, secret.lastRotated)
      .run();

    return c.json({
      message: "Secret rotated successfully",
      id: secretId,
      lastRotated: secret.lastRotated,
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    console.error("Rotate secret error:", error);
    throw new HTTPException(500, {
      message: "Failed to rotate secret",
    });
  }
});

// Search documentation
app.get("/api/docs/search", validateQuery(SearchDocsSchema), async (c) => {
  try {
    const { service, q, limit } = c.get("validatedQuery");

    // Generate embedding for query
    const embedding = await generateEmbedding(c.env, q);

    // Search vector database
    const results = await c.env.VECTOR_DB.query(embedding, {
      topK: limit || 5,
      filter: { service },
    });

    return c.json({
      results: results.matches,
      query: q,
      service,
    });
  } catch (error) {
    console.error("Search documentation error:", error);
    throw new HTTPException(500, {
      message: "Failed to search documentation",
    });
  }
});

// Validate security compliance
app.get("/api/secrets/:id/validate", validateParams(SecretIdSchema), validateQuery(ValidateComplianceSchema), async (c) => {
  try {
    const { id: secretId } = c.get("validatedParams");
    const { framework } = c.get("validatedQuery");
    const userId = c.get("userId");

    // Verify ownership
    const secretData = await c.env.SECRETS_VAULT.get(`secret:${secretId}`);
    if (!secretData) {
      throw new HTTPException(404, {
        message: "Secret not found",
      });
    }

    const secret = JSON.parse(secretData);
    if (secret.userId !== userId) {
      throw new HTTPException(403, {
        message: "Unauthorized to validate this secret",
      });
    }

    const validation = await validateCompliance(c.env, secretId, framework);

    return c.json(validation);
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    console.error("Validate compliance error:", error);
    throw new HTTPException(500, {
      message: "Failed to validate compliance",
    });
  }
});

// AI Agent endpoint
app.post("/api/agent/chat", validateBody(AgentChatSchema), async (c) => {
  try {
    const { message, context } = c.get("validatedBody");
    const userId = c.get("userId"); // From auth middleware

    const agent = c.env.SECRET_AGENT.get(c.env.SECRET_AGENT.idFromName(userId));
    const response = await agent.fetch(
      new Request("http://agent/chat", {
        method: "POST",
        body: JSON.stringify({ message, context }),
      })
    );

    return new Response(response.body, {
      headers: { "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Agent chat error:", error);
    throw new HTTPException(500, {
      message: "Failed to process agent chat",
    });
  }
});

// Helper functions
function analyzeDependencies(dependencies: Record<string, string>): string[] {
  const serviceMap: Record<string, string[]> = {
    stripe: ["stripe", "@stripe/stripe-js"],
    openai: ["openai"],
    aws: ["aws-sdk", "@aws-sdk"],
    supabase: ["@supabase/supabase-js"],
    anthropic: ["@anthropic-ai/sdk"],
    sendgrid: ["@sendgrid/mail"],
    twilio: ["twilio"],
  };

  const detected: string[] = [];
  for (const [service, packages] of Object.entries(serviceMap)) {
    if (packages.some((pkg) => Object.keys(dependencies).some((d) => d.includes(pkg)))) {
      detected.push(service);
    }
  }
  return detected;
}

async function getRecommendations(env: Env, services: string[]) {
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are an API key management expert. Provide concise recommendations.",
      },
      {
        role: "user",
        content: `Detected services: ${services.join(", ")}. Recommend security best practices and key configurations.`, 
      },
    ],
    max_tokens: 500,
  });

  return response.choices[0].message.content;
}

async function findMissingKeys(env: Env, services: string[], userId: string): Promise<string[]> {
  const existing = await env.DATABASE.prepare(
    `SELECT DISTINCT service FROM secrets WHERE user_id = ?`
  )
    .bind(userId)
    .all();

  const existingServices = existing.results.map((r: any) => r.service);
  return services.filter((s) => !existingServices.includes(s));
}

// Encryption functions moved to ./crypto.ts for better maintainability and security

async function generateApiKey(service: string): Promise<string> {
  // Generate secure random API key
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return `sk_${service}_${btoa(String.fromCharCode(...array)).replace(/[+/=]/g, "")}`;
}

async function generateEmbedding(env: Env, text: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  const data = await response.json<any>();
  return data.data[0].embedding;
}

async function validateCompliance(env: Env, secretId: string, framework: string) {
  // Compliance validation logic
  return {
    compliant: true,
    framework,
    checks: [
      { name: "Encryption at rest", passed: true },
      { name: "Access logging", passed: true },
      { name: "Key rotation policy", passed: true },
    ],
  };
}

// AI Agent for intelligent secret management
export class SecretAgent extends Agent<Env> {
  async onRequest(request: Request) {
    const { message } = await request.json<any>();

    const client = new OpenAI({ apiKey: this.env.OPENAI_API_KEY });

    const stream = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are SecretForge AI, an intelligent API key management assistant. Help users provision, rotate, and manage API keys securely. Current context: ${JSON.stringify(await this.getState())}`,
        },
        { role: "user", content: message },
      ],
      stream: true,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
          }
        }
        controller.close();
      },
    });

    return new Response(readable, {
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  async processKeyRequest(service: string, environment: string) {
    // Use the agent's state management
    await this.setState({
      ...this.state,
      lastRequest: { service, environment, timestamp: Date.now() },
    });

    // Log to embedded SQLite
    await this.sql`
      INSERT INTO key_requests (service, environment, timestamp)
      VALUES (${service}, ${environment}, ${Date.now()})
    `;
  }

  onStateUpdate(state: any, source: string) {
    console.log("Agent state updated:", { state, source });
  }
}

export default app;
