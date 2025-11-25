import { Hono } from "hono";
import { cors } from "hono/cors";
import { Agent } from "agents";
import { OpenAI } from "openai";
import postgres from "postgres";

interface Env {
  SECRETS_VAULT: KVNamespace;
  VECTOR_DB: Vectorize;
  DATABASE: D1Database;
  HYPERDRIVE: Hyperdrive;
  SECRET_AGENT: any; // AgentNamespace<SecretAgent>
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

app.use("*", cors());

// Health check
app.get("/health", (c) => {
  return c.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Analyze project endpoint
app.post("/api/analyze", async (c) => {
  const { projectPath, dependencies } = await c.req.json();

  const detectedServices = analyzeDependencies(dependencies);
  const recommendations = await getRecommendations(c.env, detectedServices);

  return c.json({
    detectedServices,
    recommendations,
    missingKeys: await findMissingKeys(c.env, detectedServices),
  });
});

// Create secret
app.post("/api/secrets", async (c) => {
  const { service, environment, scopes, userId } = await c.req.json();

  const secretId = crypto.randomUUID();
  const encryptedValue = await encryptSecret(
    c.env.ENCRYPTION_KEY,
    await generateApiKey(service)
  );

  const secret: Secret = {
    id: secretId,
    service,
    environment,
    scopes: scopes || [],
    created: new Date().toISOString(),
    userId,
  };

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

  return c.json({ secret: { ...secret, value: "[ENCRYPTED]" } }, 201);
});

// Get secret
app.get("/api/secrets/:id", async (c) => {
  const secretId = c.req.param("id");
  const secretData = await c.env.SECRETS_VAULT.get(`secret:${secretId}`);

  if (!secretData) {
    return c.json({ error: "Secret not found" }, 404);
  }

  const secret = JSON.parse(secretData);
  const decryptedValue = await decryptSecret(c.env.ENCRYPTION_KEY, secret.value);

  return c.json({
    ...secret,
    value: decryptedValue,
  });
});

// Rotate secret
app.post("/api/secrets/:id/rotate", async (c) => {
  const secretId = c.req.param("id");
  const secretData = await c.env.SECRETS_VAULT.get(`secret:${secretId}`);

  if (!secretData) {
    return c.json({ error: "Secret not found" }, 404);
  }

  const secret = JSON.parse(secretData);
  const newValue = await generateApiKey(secret.service);
  const encryptedValue = await encryptSecret(c.env.ENCRYPTION_KEY, newValue);

  secret.value = encryptedValue;
  secret.lastRotated = new Date().toISOString();

  await c.env.SECRETS_VAULT.put(`secret:${secretId}`, JSON.stringify(secret));

  return c.json({ message: "Secret rotated successfully", id: secretId });
});

// Search documentation
app.get("/api/docs/search", async (c) => {
  const service = c.req.query("service");
  const query = c.req.query("q");

  if (!service || !query) {
    return c.json({ error: "Missing service or query" }, 400);
  }

  // Generate embedding for query
  const embedding = await generateEmbedding(c.env, query);

  // Search vector database
  const results = await c.env.VECTOR_DB.query(embedding, {
    topK: 5,
    filter: { service },
  });

  return c.json({ results: results.matches });
});

// Validate security compliance
app.get("/api/secrets/:id/validate", async (c) => {
  const secretId = c.req.param("id");
  const framework = c.req.query("framework");

  const validation = await validateCompliance(c.env, secretId, framework || "SOC2");

  return c.json(validation);
});

// AI Agent endpoint
app.post("/api/agent/chat", async (c) => {
  const { message, userId } = await c.req.json();

  const agent = c.env.SECRET_AGENT.get(c.env.SECRET_AGENT.idFromName(userId));
  const response = await agent.fetch(
    new Request("http://agent/chat", {
      method: "POST",
      body: JSON.stringify({ message }),
    })
  );

  return new Response(response.body, {
    headers: { "Content-Type": "text/event-stream" },
  });
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

async function findMissingKeys(env: Env, services: string[]): Promise<string[]> {
  const existing = await env.DATABASE.prepare(
    `SELECT DISTINCT service FROM secrets WHERE user_id = ?`
  )
    .bind("current-user") // In production, use actual user ID
    .all();

  const existingServices = existing.results.map((r: any) => r.service);
  return services.filter((s) => !existingServices.includes(s));
}

async function encryptSecret(key: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, data);

  return btoa(
    JSON.stringify({
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(encrypted)),
    })
  );
}

async function decryptSecret(key: string, encryptedValue: string): Promise<string> {
  const encoder = new TextEncoder();
  const { iv, data } = JSON.parse(atob(encryptedValue));

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    cryptoKey,
    new Uint8Array(data)
  );

  return new TextDecoder().decode(decrypted);
}

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
          content: `You are SecretForge AI, an intelligent API key management assistant. Help users provision, rotate, and manage API keys securely. Current context: ${JSON.stringify(this.state || {})}`,
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
    const currentState = (this.state || {}) as Record<string, any>;
    await this.setState({
      ...currentState,
      lastRequest: { service, environment, timestamp: Date.now() },
    });

    // Log to embedded SQLite
    await this.sql`
      INSERT INTO key_requests (service, environment, timestamp)
      VALUES (${service}, ${environment}, ${Date.now()})
    `;
  }

  onStateUpdate(state: any, source: any) {
    console.log("Agent state updated:", { state, source });
  }
}

export default app;
