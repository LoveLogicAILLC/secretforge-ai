import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('openai', () => {
  return {
    OpenAI: class {
      chat = {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: 'Mock recommendations for security best practices',
                },
              },
            ],
          }),
        },
      };
    },
  };
});

import app from '../index';
import { createJWT } from '../middleware/auth';

/**
 * Tests all endpoints with authentication and authorization
 */

const TEST_ENV = {
  DATABASE: createMockD1Database(),
  SECRETS_VAULT: createMockKV(),
  RATE_LIMIT_KV: createMockKV(),
  VECTOR_DB: createMockVectorize(),
  SECRET_AGENT: createMockAgentNamespace(),
  HYPERDRIVE: {} as any,
  OPENAI_API_KEY: 'TEST_OPENAI_KEY_NOT_REAL',
  ANTHROPIC_API_KEY: 'TEST_ANTHROPIC_KEY_NOT_REAL',
  ENCRYPTION_KEY: Buffer.from('01234567890123456789012345678901').toString('base64'),
  JWT_SECRET: 'test-jwt-secret-32-bytes-long',
  API_KEY_SALT: 'test-api-key-salt-32-bytes-long',
};

let authToken: string;
let testSecretId: string;

beforeAll(async () => {
  // Generate test JWT
  authToken = await createJWT(
    {
      userId: 'test-user-id',
      email: 'test@example.com',
      tier: 'pro',
    },
    TEST_ENV.JWT_SECRET
  );
});

describe('Health Check', () => {
  it('should return healthy status', async () => {
    const req = new Request('http://localhost/health');
    const res = await app.fetch(req, TEST_ENV);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe('healthy');
    expect(data.timestamp).toBeDefined();
  });
});

describe('Authentication', () => {
  it('should reject requests without auth token', async () => {
    const req = new Request('http://localhost/api/secrets');
    const res = await app.fetch(req, TEST_ENV);

    expect(res.status).toBe(401);
  });

  it('should accept requests with valid JWT', async () => {
    const req = new Request('http://localhost/api/secrets', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });
    const res = await app.fetch(req, TEST_ENV);

    expect(res.status).not.toBe(401);
  });

  it('should accept requests with valid API key', async () => {
    const req = new Request('http://localhost/api/secrets', {
      headers: {
        'X-API-Key': 'sf_test_api_key_valid_format_here',
      },
    });
    const res = await app.fetch(req, TEST_ENV);

    // Will fail with 404 or 200, but not 401
    expect(res.status).not.toBe(401);
  });
});

describe('User Signup and Login', () => {
  it('should create new user account', async () => {
    const req = new Request('http://localhost/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'SecurePass123',
        tier: 'free',
      }),
    });

    const res = await app.fetch(req, TEST_ENV);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.user.email).toBe('test@example.com');
    expect(data.token).toBeDefined();
  });

  it('should reject weak passwords', async () => {
    const req = new Request('http://localhost/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test2@example.com',
        password: 'weak',
        tier: 'free',
      }),
    });

    const res = await app.fetch(req, TEST_ENV);
    expect(res.status).toBe(400);
  });

  it('should login with correct credentials', async () => {
    const req = new Request('http://localhost/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'SecurePass123',
      }),
    });

    const res = await app.fetch(req, TEST_ENV);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.token).toBeDefined();
  });
});

describe('Secret Management', () => {
  it('should create a new secret', async () => {
    const req = new Request('http://localhost/api/secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        service: 'stripe',
        environment: 'development',
        scopes: ['read_write'],
      }),
    });

    const res = await app.fetch(req, TEST_ENV);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.secret.service).toBe('stripe');
    expect(data.secret.id).toBeDefined();
    testSecretId = data.secret.id;
  });

  it('should list all secrets', async () => {
    const req = new Request('http://localhost/api/secrets', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    const res = await app.fetch(req, TEST_ENV);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(data.secrets)).toBe(true);
  });

  it('should retrieve specific secret', async () => {
    const req = new Request(`http://localhost/api/secrets/${testSecretId}`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    const res = await app.fetch(req, TEST_ENV);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.id).toBe(testSecretId);
    expect(data.value).toBeDefined();
  });

  it('should rotate secret', async () => {
    const req = new Request(`http://localhost/api/secrets/${testSecretId}/rotate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const res = await app.fetch(req, TEST_ENV);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.message).toContain('rotated');
  });

});

describe('Project Analysis', () => {
  it('should analyze project dependencies', async () => {
    const req = new Request('http://localhost/api/analyze', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dependencies: {
          stripe: '^12.0.0',
          openai: '^4.0.0',
        },
      }),
    });

    const res = await app.fetch(req, TEST_ENV);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.detectedServices).toContain('stripe');
    expect(data.detectedServices).toContain('openai');
    expect(data.recommendations).toBeDefined();
  });
});

describe('Compliance Validation', () => {
  it('should validate secret compliance', async () => {
    const req = new Request(
      `http://localhost/api/secrets/${testSecretId}/validate?framework=SOC2`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }
    );

    const res = await app.fetch(req, TEST_ENV);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.framework).toBe('SOC2');
    expect(data.compliant).toBeDefined();
  });
});

describe('Secret Deletion', () => {
  it('should delete secret', async () => {
    const req = new Request(`http://localhost/api/secrets/${testSecretId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    const res = await app.fetch(req, TEST_ENV);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.message).toContain('deleted');
  });
});
describe('Rate Limiting', () => {
  it('should enforce rate limits', async () => {
    const requests = [];

    // Make 200 requests (exceeds free tier limit)
    for (let i = 0; i < 200; i++) {
      requests.push(
        app.fetch(
          new Request('http://localhost/api/secrets', {
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
          }),
          TEST_ENV
        )
      );
    }

    const responses = await Promise.all(requests);
    const rateLimited = responses.some((res) => res.status === 429);

    // Should hit rate limit at some point
    expect(rateLimited).toBe(true);
  });
});

describe('Tier-based Access Control', () => {
  it('should allow pro tier to access AI features', async () => {
    const req = new Request('http://localhost/api/agent/chat', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Help me rotate my Stripe keys',
      }),
    });

    const res = await app.fetch(req, TEST_ENV);
    expect(res.status).not.toBe(403);
  });

  it('should deny free tier access to AI features', async () => {
    const freeToken = await createJWT(
      {
        userId: 'free-user-id',
        email: 'free@example.com',
        tier: 'free',
      },
      TEST_ENV.JWT_SECRET
    );

    const req = new Request('http://localhost/api/agent/chat', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${freeToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: 'Help me rotate my Stripe keys',
      }),
    });

    const res = await app.fetch(req, TEST_ENV);
    expect(res.status).toBe(403);
  });
});

describe('Error Handling', () => {
  let errorAuthToken: string;

  beforeAll(async () => {
    errorAuthToken = await createJWT(
      {
        userId: 'error-handling-user-id',
        email: 'error@example.com',
        tier: 'pro',
      },
      TEST_ENV.JWT_SECRET
    );
  });

  it('should return 404 for non-existent secret', async () => {
    const req = new Request('http://localhost/api/secrets/non-existent-id', {
      headers: {
        Authorization: `Bearer ${errorAuthToken}`,
      },
    });

    const res = await app.fetch(req, TEST_ENV);
    expect(res.status).toBe(404);
  });

  it('should return 400 for invalid request body', async () => {
    const req = new Request('http://localhost/api/secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${errorAuthToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // Missing required fields
      }),
    });

    const res = await app.fetch(req, TEST_ENV);
    expect(res.status).toBe(400);
  });

  it('should return standardized error format', async () => {
    const req = new Request('http://localhost/api/secrets/non-existent', {
      headers: {
        Authorization: `Bearer ${errorAuthToken}`,
      },
    });

    const res = await app.fetch(req, TEST_ENV);
    const data = await res.json();

    expect(data.error).toBeDefined();
    expect(data.error.message).toBeDefined();
    expect(data.error.code).toBeDefined();
    expect(data.error.timestamp).toBeDefined();
  });
});

// ============================================================================
// Mock Implementations
// ============================================================================

function createMockD1Database(): D1Database {
  const users: Array<{
    id: string;
    email: string;
    password_hash: string;
    tier: string;
    organization_id?: string;
    is_active: number;
  }> = [];

  const apiKeys: Array<{
    key_hash: string;
    user_id: string;
    revoked: number;
    expires_at: string | null;
    last_used_at?: string;
  }> = [];

  const apiSecrets: Array<{
    id: string;
    service: string;
    environment: string;
    user_id: string;
    scopes: string;
    origin: string;
    created_at: string;
    last_rotated_at: string | null;
    is_active: number;
  }> = [];

  return {
    prepare(query: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async run() {
              if (query.includes('INSERT INTO users')) {
                users.push({
                  id: values[0] as string,
                  email: values[1] as string,
                  password_hash: values[2] as string,
                  tier: values[3] as string,
                  is_active: 1,
                });
                return { success: true, results: [] };
              }
              if (query.includes('INSERT INTO api_secrets')) {
                apiSecrets.push({
                  id: values[0] as string,
                  service: values[1] as string,
                  environment: values[2] as string,
                  user_id: values[3] as string,
                  scopes: values[4] as string,
                  origin: values[5] as string,
                  created_at: values[6] as string,
                  last_rotated_at: null,
                  is_active: 1,
                });
                return { success: true, results: [] };
              }
              if (query.includes('UPDATE api_secrets SET last_rotated_at = ?')) {
                const secret = apiSecrets.find(
                  (s) => s.id === values[1] && s.user_id === values[2]
                );
                if (secret) {
                  secret.last_rotated_at = values[0] as string;
                }
                return { success: true, results: [] };
              }
              if (query.includes('UPDATE api_secrets SET is_active = 0')) {
                const secret = apiSecrets.find(
                  (s) => s.id === values[0] && s.user_id === values[1]
                );
                if (secret) {
                  secret.is_active = 0;
                }
                return { success: true, results: [] };
              }
              return { success: true, results: [] };
            },
            async first() {
              if (query.includes('FROM users WHERE email = ?')) {
                const user = users.find((u) => u.email === values[0]);
                return (user as unknown) || null;
              }
              if (query.includes('FROM api_keys ak')) {
                // api key validation query
                // If any user exists or test user, return user
                const u = users[0] || {
                  id: 'test-user-id',
                  email: 'test@example.com',
                  tier: 'pro',
                };
                return {
                  id: u.id,
                  email: u.email,
                  tier: u.tier,
                  organization_id: u.organization_id,
                };
              }
              if (query.includes('FROM api_secrets WHERE id = ?')) {
                const secret = apiSecrets.find(
                  (s) => s.id === values[0] && (values.length < 2 || s.user_id === values[1]) && s.is_active === 1
                );
                return (secret as unknown) || null;
              }
              if (query.includes('SELECT COUNT(*) as count FROM api_secrets')) {
                const count = apiSecrets.filter(
                  (s) => s.user_id === values[0] && s.is_active === 1
                ).length;
                return { count };
              }
              if (query.includes('SELECT COUNT(*) as count FROM api_audit_logs')) {
                return { count: 1 };
              }
              return null;
            },
            async all() {
              if (query.includes('FROM api_secrets WHERE user_id = ?')) {
                const activeSecrets = apiSecrets.filter(
                  (s) => s.user_id === values[0] && s.is_active === 1
                );
                return { results: activeSecrets };
              }
              return { results: [] };
            },
          };
        },
        async run() {
          return { success: true, results: [] };
        },
        async first() {
          return null;
        },
        async all() {
          return { results: [] };
        },
      };
    },
    async batch() {
      return [];
    },
    async dump() {
      return new ArrayBuffer(0);
    },
    async exec() {
      return { count: 0, duration: 0 };
    },
  } as unknown as D1Database;
}

function createMockKV(): KVNamespace {
  const storage = new Map<string, string>();

  return {
    async get(key: string, options?: any) {
      const value = storage.get(key);
      if (!value) return null;

      if (options === 'json') {
        return JSON.parse(value);
      }
      return value;
    },
    async put(key: string, value: string, options?: any) {
      storage.set(key, value);
    },
    async delete(key: string) {
      storage.delete(key);
    },
    async list(options?: any) {
      return { keys: [], list_complete: true, cursor: '' };
    },
    async getWithMetadata(key: string, options?: any) {
      return { value: storage.get(key) || null, metadata: null };
    },
  } as any;
}

function createMockVectorize(): Vectorize {
  return {
    async query(vector: number[], options?: any) {
      return {
        matches: [],
        count: 0,
      };
    },
    async insert(vectors: any[]) {
      return { ids: [], mutationId: 'mock-id' };
    },
    async upsert(vectors: any[]) {
      return { ids: [], mutationId: 'mock-id' };
    },
    async getByIds(ids: string[]) {
      return [];
    },
    async deleteByIds(ids: string[]) {
      return { deletedCount: 0, mutationId: 'mock-id' };
    },
  } as any;
}

function createMockAgentNamespace(): any {
  return {
    get(id: any) {
      return {
        async fetch(request: Request) {
          return new Response('data: {"content":"Mock agent response"}\n\n', {
            headers: { 'Content-Type': 'text/event-stream' },
          });
        },
      };
    },
    idFromName(name: string) {
      return { toString: () => name };
    },
  };
}
