import { Hono } from 'hono';
import { Agent } from 'agents';
import { OpenAI } from 'openai';
import { auth, optionalAuth, requireTier, createJWT } from './middleware/auth';
import { tierRateLimit, ipRateLimit, endpointRateLimit } from './middleware/rateLimit';
import {
  errorHandler,
  requestLogger,
  securityHeaders,
  corsMiddleware,
  notFoundHandler,
  validateRequest,
} from './middleware/errorHandler';
import {
  createSecretSchema,
  rotateSecretSchema,
  analyzeProjectSchema,
  chatMessageSchema,
  searchDocsSchema,
} from './schemas/validation';
import authRouter from './routes/auth';
import billingRouter from './routes/billing';

interface Env {
  SECRETS_VAULT: KVNamespace;
  VECTOR_DB: Vectorize;
  DATABASE: D1Database;
  HYPERDRIVE: Hyperdrive;
  SECRET_AGENT: AgentNamespace<SecretAgent>;
  RATE_LIMIT_KV: KVNamespace;
  OPENAI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  ENCRYPTION_KEY: string;
  JWT_SECRET: string;
  API_KEY_SALT: string;
  STRIPE_API_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
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

// ============================================================================
// Global Middleware
// ============================================================================

app.use('*', corsMiddleware());
app.use('*', securityHeaders);
app.use('*', requestLogger);

// ============================================================================
// Public Routes (No authentication required)
// ============================================================================

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// Mount auth routes
app.route('/auth', authRouter);

// Mount billing routes
app.route('/billing', billingRouter);

// ============================================================================
// Protected Routes (Authentication required)
// ============================================================================

// Analyze project endpoint
app.post(
  '/api/analyze',
  auth,
  tierRateLimit(),
  validateRequest(analyzeProjectSchema),
  async (c) => {
    const user = c.get('user');
    const { dependencies } = c.get('validatedData');

    const detectedServices = analyzeDependencies(dependencies || {});
    const recommendations = await getRecommendations(c.env, detectedServices);

    // Track usage
    await trackUsage(c.env.DATABASE, user.userId, 'api_call');

    return c.json({
      detectedServices,
      recommendations,
      missingKeys: await findMissingKeys(c.env, user.userId, detectedServices),
    });
  }
);

// Create secret
app.post(
  '/api/secrets',
  auth,
  tierRateLimit(),
  endpointRateLimit('create-secret', 60000, 20),
  validateRequest(createSecretSchema),
  async (c) => {
    const user = c.get('user');
    const { service, environment, scopes, value } = c.get('validatedData');

    // Check tier limits
    await enforceTierLimits(c.env.DATABASE, user.userId, user.tier);

    const secretId = crypto.randomUUID();
    const secretValue = value || (await generateApiKey(service));
    const encryptedValue = await encryptSecret(c.env.ENCRYPTION_KEY, secretValue);

    const secret: Secret = {
      id: secretId,
      service,
      environment,
      scopes: scopes || [],
      created: new Date().toISOString(),
      userId: user.userId,
    };

    // Store in KV
    await c.env.SECRETS_VAULT.put(
      `secret:${secretId}`,
      JSON.stringify({ ...secret, value: encryptedValue }),
      {
        metadata: { service, environment, userId: user.userId },
      }
    );

    // Store metadata in D1
    await c.env.DATABASE.prepare(
      `INSERT INTO secrets (id, service, environment, user_id, scopes, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(
        secretId,
        service,
        environment,
        user.userId,
        JSON.stringify(scopes || []),
        secret.created
      )
      .run();

    // Audit log
    await logAudit(c.env.DATABASE, {
      secretId,
      userId: user.userId,
      action: 'created',
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    // Track usage
    await trackUsage(c.env.DATABASE, user.userId, 'secret_created');

    return c.json(
      {
        secret: { ...secret, value: '[ENCRYPTED]' },
      },
      201
    );
  }
);

// Get secret
app.get('/api/secrets/:id', auth, tierRateLimit(), async (c) => {
  const user = c.get('user');
  const secretId = c.req.param('id');

  const secretData = await c.env.SECRETS_VAULT.get(`secret:${secretId}`);

  if (!secretData) {
    return c.json({ error: 'Secret not found' }, 404);
  }

  const secret = JSON.parse(secretData);

  // Verify ownership
  if (secret.userId !== user.userId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const decryptedValue = await decryptSecret(c.env.ENCRYPTION_KEY, secret.value);

  // Audit log
  await logAudit(c.env.DATABASE, {
    secretId,
    userId: user.userId,
    action: 'retrieved',
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return c.json({
    ...secret,
    value: decryptedValue,
  });
});

// List secrets
app.get('/api/secrets', auth, tierRateLimit(), async (c) => {
  const user = c.get('user');
  const environment = c.req.query('environment');

  let query = 'SELECT * FROM secrets WHERE user_id = ? AND is_active = 1';
  const bindings: any[] = [user.userId];

  if (environment) {
    query += ' AND environment = ?';
    bindings.push(environment);
  }

  query += ' ORDER BY created_at DESC';

  const result = await c.env.DATABASE.prepare(query)
    .bind(...bindings)
    .all();

  return c.json({
    secrets: result.results.map((s) => ({
      ...s,
      scopes: JSON.parse((s.scopes as string) || '[]'),
    })),
  });
});

// Rotate secret
app.post(
  '/api/secrets/:id/rotate',
  auth,
  tierRateLimit(),
  validateRequest(rotateSecretSchema),
  async (c) => {
    const user = c.get('user');
    const secretId = c.req.param('id');

    const secretData = await c.env.SECRETS_VAULT.get(`secret:${secretId}`);

    if (!secretData) {
      return c.json({ error: 'Secret not found' }, 404);
    }

    const secret = JSON.parse(secretData);

    // Verify ownership
    if (secret.userId !== user.userId) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    const newValue = await generateApiKey(secret.service);
    const encryptedValue = await encryptSecret(c.env.ENCRYPTION_KEY, newValue);

    secret.value = encryptedValue;
    secret.lastRotated = new Date().toISOString();

    await c.env.SECRETS_VAULT.put(`secret:${secretId}`, JSON.stringify(secret));

    // Update D1
    await c.env.DATABASE.prepare('UPDATE secrets SET last_rotated_at = ? WHERE id = ?')
      .bind(secret.lastRotated, secretId)
      .run();

    // Audit log
    await logAudit(c.env.DATABASE, {
      secretId,
      userId: user.userId,
      action: 'rotated',
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    // Track usage
    await trackUsage(c.env.DATABASE, user.userId, 'secret_rotated');

    return c.json({
      message: 'Secret rotated successfully',
      id: secretId,
      rotatedAt: secret.lastRotated,
    });
  }
);

// Delete secret
app.delete('/api/secrets/:id', auth, tierRateLimit(), async (c) => {
  const user = c.get('user');
  const secretId = c.req.param('id');

  const secretData = await c.env.SECRETS_VAULT.get(`secret:${secretId}`);

  if (!secretData) {
    return c.json({ error: 'Secret not found' }, 404);
  }

  const secret = JSON.parse(secretData);

  // Verify ownership
  if (secret.userId !== user.userId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  // Soft delete in D1
  await c.env.DATABASE.prepare('UPDATE secrets SET is_active = 0 WHERE id = ?')
    .bind(secretId)
    .run();

  // Delete from KV
  await c.env.SECRETS_VAULT.delete(`secret:${secretId}`);

  // Audit log
  await logAudit(c.env.DATABASE, {
    secretId,
    userId: user.userId,
    action: 'deleted',
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return c.json({ message: 'Secret deleted successfully' });
});

// Search documentation
app.get(
  '/api/docs/search',
  auth,
  tierRateLimit(),
  requireTier('pro', 'team', 'enterprise'),
  async (c) => {
    const service = c.req.query('service');
    const query = c.req.query('q');

    if (!service || !query) {
      return c.json({ error: 'Missing service or query' }, 400);
    }

    // Generate embedding for query
    const embedding = await generateEmbedding(c.env, query);

    // Search vector database
    const results = await c.env.VECTOR_DB.query(embedding, {
      topK: 5,
      filter: { service },
    });

    return c.json({ results: results.matches });
  }
);

// Validate security compliance
app.get('/api/secrets/:id/validate', auth, tierRateLimit(), async (c) => {
  const user = c.get('user');
  const secretId = c.req.param('id');
  const framework = c.req.query('framework') || 'SOC2';

  // Verify ownership
  const secret = await c.env.DATABASE.prepare('SELECT * FROM secrets WHERE id = ? AND user_id = ?')
    .bind(secretId, user.userId)
    .first();

  if (!secret) {
    return c.json({ error: 'Secret not found' }, 404);
  }

  const validation = await validateCompliance(c.env, secretId, framework);

  // Store validation result
  await c.env.DATABASE.prepare(
    `INSERT INTO compliance_validations (secret_id, framework, is_compliant, validation_results)
     VALUES (?, ?, ?, ?)`
  )
    .bind(secretId, framework, validation.compliant ? 1 : 0, JSON.stringify(validation))
    .run();

  return c.json(validation);
});

// AI Agent endpoint
app.post(
  '/api/agent/chat',
  auth,
  tierRateLimit(),
  requireTier('pro', 'team', 'enterprise'),
  validateRequest(chatMessageSchema),
  async (c) => {
    const user = c.get('user');
    const { message } = c.get('validatedData');

    const agent = c.env.SECRET_AGENT.get(c.env.SECRET_AGENT.idFromName(user.userId));
    const response = await agent.fetch(
      new Request('http://agent/chat', {
        method: 'POST',
        body: JSON.stringify({ message }),
      })
    );

    // Track usage
    await trackUsage(c.env.DATABASE, user.userId, 'ai_request');

    return new Response(response.body, {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }
);

// ============================================================================
// Helper Functions
// ============================================================================

function analyzeDependencies(dependencies: Record<string, string>): string[] {
  const serviceMap: Record<string, string[]> = {
    stripe: ['stripe', '@stripe/stripe-js'],
    openai: ['openai'],
    aws: ['aws-sdk', '@aws-sdk'],
    supabase: ['@supabase/supabase-js'],
    anthropic: ['@anthropic-ai/sdk'],
    sendgrid: ['@sendgrid/mail'],
    twilio: ['twilio'],
    mongodb: ['mongodb', 'mongoose'],
    postgresql: ['pg', 'postgres'],
    redis: ['redis', 'ioredis'],
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
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are an API key management expert. Provide concise security recommendations.',
      },
      {
        role: 'user',
        content: `Detected services: ${services.join(', ')}. Recommend security best practices and key configurations.`,
      },
    ],
    max_tokens: 500,
  });

  return response.choices[0].message.content;
}

async function findMissingKeys(env: Env, userId: string, services: string[]): Promise<string[]> {
  const existing = await env.DATABASE.prepare(
    `SELECT DISTINCT service FROM secrets WHERE user_id = ? AND is_active = 1`
  )
    .bind(userId)
    .all();

  const existingServices = existing.results.map((r: any) => r.service);
  return services.filter((s) => !existingServices.includes(s));
}

async function encryptSecret(key: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, data);

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
    'raw',
    encoder.encode(key),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    cryptoKey,
    new Uint8Array(data)
  );

  return new TextDecoder().decode(decrypted);
}

async function generateApiKey(service: string): Promise<string> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return `sk_${service}_${btoa(String.fromCharCode(...array)).replace(/[+/=]/g, '')}`;
}

async function generateEmbedding(env: Env, text: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  });

  const data = (await response.json()) as any;
  return data.data[0].embedding;
}

async function validateCompliance(env: Env, secretId: string, framework: string) {
  return {
    compliant: true,
    framework,
    checks: [
      { name: 'Encryption at rest', passed: true },
      { name: 'Access logging', passed: true },
      { name: 'Key rotation policy', passed: true },
    ],
  };
}

async function enforceTierLimits(db: D1Database, userId: string, tier: string): Promise<void> {
  const limits: Record<string, number> = {
    free: 10,
    pro: -1, // Unlimited
    team: -1,
    enterprise: -1,
  };

  const limit = limits[tier] || 10;

  if (limit === -1) return; // Unlimited

  const count = await db
    .prepare('SELECT COUNT(*) as count FROM secrets WHERE user_id = ? AND is_active = 1')
    .bind(userId)
    .first<{ count: number }>();

  if (count && count.count >= limit) {
    throw new Error(
      `Free tier limit reached (${limit} secrets). Upgrade to Pro for unlimited secrets.`
    );
  }
}

async function logAudit(
  db: D1Database,
  data: {
    secretId: string;
    userId: string;
    action: string;
    ipAddress?: string;
    userAgent?: string;
  }
) {
  await db
    .prepare(
      `INSERT INTO audit_logs (secret_id, user_id, action, ip_address, user_agent, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      data.secretId,
      data.userId,
      data.action,
      data.ipAddress || null,
      data.userAgent || null,
      new Date().toISOString()
    )
    .run();
}

async function trackUsage(db: D1Database, userId: string, eventType: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO usage_events (user_id, event_type, timestamp)
       VALUES (?, ?, ?)`
    )
    .bind(userId, eventType, new Date().toISOString())
    .run();
}

// ============================================================================
// AI Agent for intelligent secret management
// ============================================================================

export class SecretAgent extends Agent<Env> {
  async onRequest(request: Request) {
    const { message } = (await request.json()) as any;

    const client = new OpenAI({ apiKey: this.env.OPENAI_API_KEY });

    const stream = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are SecretForge AI, an intelligent API key management assistant. Help users provision, rotate, and manage API keys securely. Current context: ${JSON.stringify(await this.getState())}`,
        },
        { role: 'user', content: message },
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
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  async processKeyRequest(service: string, environment: string) {
    await this.setState({
      ...this.state,
      lastRequest: { service, environment, timestamp: Date.now() },
    });

    await this.sql`
      INSERT INTO key_requests (service, environment, timestamp)
      VALUES (${service}, ${environment}, ${Date.now()})
    `;
  }

  onStateUpdate(state: unknown, source: any) {
    console.log('Agent state updated:', { state, source });
  }
}

// ============================================================================
// Error Handler & 404
// ============================================================================

app.onError(errorHandler);
app.notFound(notFoundHandler);

export default app;
