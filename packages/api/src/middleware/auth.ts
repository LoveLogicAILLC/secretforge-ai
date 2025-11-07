/**
 * Authentication Middleware for SecretForge API
 *
 * Implements Bearer token authentication with API key validation
 */

import { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";

interface AuthEnv {
  DATABASE: D1Database;
  SECRETS_VAULT: KVNamespace;
}

/**
 * Validates Bearer token from Authorization header
 */
export async function authMiddleware(c: Context<{ Bindings: AuthEnv }>, next: Next) {
  // Skip auth for health check and public endpoints
  const publicPaths = ["/health", "/api/docs/public"];
  if (publicPaths.some((path) => c.req.path === path)) {
    return next();
  }

  // Extract token from Authorization header
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new HTTPException(401, {
      message: "Missing or invalid Authorization header. Expected: Bearer <token>",
    });
  }

  const token = authHeader.substring(7); // Remove "Bearer " prefix

  // Validate token format (basic check)
  if (!token || token.length < 32) {
    throw new HTTPException(401, {
      message: "Invalid token format",
    });
  }

  // Verify token exists and is active
  const apiKeyData = await c.env.SECRETS_VAULT.get(`apikey:${token}`);
  if (!apiKeyData) {
    throw new HTTPException(401, {
      message: "Invalid or expired token",
    });
  }

  const apiKey = JSON.parse(apiKeyData);

  // Check if token is expired
  if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
    throw new HTTPException(401, {
      message: "Token has expired",
    });
  }

  // Check if token is active
  if (apiKey.status !== "active") {
    throw new HTTPException(403, {
      message: "Token has been revoked",
    });
  }

  // Update last used timestamp
  await c.env.SECRETS_VAULT.put(
    `apikey:${token}`,
    JSON.stringify({
      ...apiKey,
      lastUsed: new Date().toISOString(),
    }),
    {
      metadata: { userId: apiKey.userId, lastUsed: Date.now() },
    }
  );

  // Attach user context to request
  c.set("userId", apiKey.userId);
  c.set("apiKeyId", apiKey.id);

  // Log access for audit trail
  await logAccess(c.env.DATABASE, {
    userId: apiKey.userId,
    apiKeyId: apiKey.id,
    endpoint: c.req.path,
    method: c.req.method,
    ip: c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown",
    userAgent: c.req.header("User-Agent") || "unknown",
    timestamp: new Date().toISOString(),
  });

  await next();
}

/**
 * Logs API access for audit purposes
 */
async function logAccess(
  db: D1Database,
  data: {
    userId: string;
    apiKeyId: string;
    endpoint: string;
    method: string;
    ip: string;
    userAgent: string;
    timestamp: string;
  }
) {
  await db
    .prepare(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, ip_address, user_agent, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      data.userId,
      `${data.method} ${data.endpoint}`,
      "api",
      data.apiKeyId,
      data.ip,
      data.userAgent,
      data.timestamp
    )
    .run();
}

/**
 * Generates a new API key for a user
 */
export async function generateApiKey(
  env: AuthEnv,
  userId: string,
  options: {
    name?: string;
    expiresAt?: string;
    scopes?: string[];
  } = {}
): Promise<{ id: string; token: string }> {
  // Generate secure random token
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const token = btoa(String.fromCharCode(...tokenBytes))
    .replace(/[+/=]/g, "")
    .substring(0, 48);

  const id = crypto.randomUUID();
  const apiKey = {
    id,
    userId,
    name: options.name || "Default API Key",
    status: "active",
    createdAt: new Date().toISOString(),
    expiresAt: options.expiresAt,
    scopes: options.scopes || ["*"],
    lastUsed: null,
  };

  // Store in KV
  await env.SECRETS_VAULT.put(`apikey:${token}`, JSON.stringify(apiKey), {
    metadata: { userId, createdAt: Date.now() },
  });

  // Also store mapping from ID to token for revocation
  await env.SECRETS_VAULT.put(`apikey:id:${id}`, token);

  return { id, token };
}

/**
 * Revokes an API key
 */
export async function revokeApiKey(
  env: AuthEnv,
  userId: string,
  apiKeyId: string
): Promise<boolean> {
  // Get token from ID
  const token = await env.SECRETS_VAULT.get(`apikey:id:${apiKeyId}`);
  if (!token) {
    return false;
  }

  // Get API key data
  const apiKeyData = await env.SECRETS_VAULT.get(`apikey:${token}`);
  if (!apiKeyData) {
    return false;
  }

  const apiKey = JSON.parse(apiKeyData);

  // Verify ownership
  if (apiKey.userId !== userId) {
    throw new HTTPException(403, { message: "Unauthorized to revoke this API key" });
  }

  // Mark as revoked
  apiKey.status = "revoked";
  apiKey.revokedAt = new Date().toISOString();

  await env.SECRETS_VAULT.put(`apikey:${token}`, JSON.stringify(apiKey));

  return true;
}

/**
 * Lists all API keys for a user
 */
export async function listApiKeys(
  env: AuthEnv,
  userId: string
): Promise<Array<{ id: string; name: string; status: string; createdAt: string; lastUsed: string | null }>> {
  // Query KV for all keys belonging to user
  const list = await env.SECRETS_VAULT.list({
    prefix: "apikey:",
  });

  const apiKeys = [];
  for (const key of list.keys) {
    if (key.name.startsWith("apikey:id:")) continue; // Skip ID mappings

    const data = await env.SECRETS_VAULT.get(key.name);
    if (!data) continue;

    const apiKey = JSON.parse(data);
    if (apiKey.userId === userId) {
      apiKeys.push({
        id: apiKey.id,
        name: apiKey.name,
        status: apiKey.status,
        createdAt: apiKey.createdAt,
        lastUsed: apiKey.lastUsed,
      });
    }
  }

  return apiKeys;
}
