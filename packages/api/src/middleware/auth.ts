import { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { generateApiKey as generateApiKeyShared } from "@secretforge/shared";

export interface AuthUser {
  userId: string;
  email: string;
  tier: "free" | "pro" | "team" | "enterprise";
  organizationId?: string;
}

export interface AuthEnv {
  DATABASE: D1Database;
  JWT_SECRET: string;
  API_KEY_SALT: string;
}

/**
 * JWT Authentication Middleware
 * Validates Bearer tokens and extracts user information
 */
export async function jwtAuth(c: Context<{ Bindings: AuthEnv }>, next: Next) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Missing or invalid authorization header" });
  }

  const token = authHeader.substring(7);

  try {
    const user = await verifyJWT(token, c.env.JWT_SECRET);
    c.set("user", user);
    await next();
  } catch (error) {
    throw new HTTPException(401, { message: "Invalid or expired token" });
  }
}

/**
 * API Key Authentication Middleware
 * Validates API keys from X-API-Key header
 */
export async function apiKeyAuth(c: Context<{ Bindings: AuthEnv }>, next: Next) {
  const apiKey = c.req.header("X-API-Key");

  if (!apiKey) {
    throw new HTTPException(401, { message: "Missing API key" });
  }

  if (!apiKey.startsWith("sf_")) {
    throw new HTTPException(401, { message: "Invalid API key format" });
  }

  try {
    const user = await validateApiKey(c.env.DATABASE, apiKey);
    c.set("user", user);
    await next();
  } catch (error) {
    throw new HTTPException(401, { message: "Invalid API key" });
  }
}

/**
 * Flexible Authentication Middleware
 * Accepts either JWT Bearer token or API key
 */
export async function auth(c: Context<{ Bindings: AuthEnv }>, next: Next) {
  const authHeader = c.req.header("Authorization");
  const apiKey = c.req.header("X-API-Key");

  // Try JWT first
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    try {
      const user = await verifyJWT(token, c.env.JWT_SECRET);
      c.set("user", user);
      await next();
      return;
    } catch (error) {
      // JWT validation failed, try API key
    }
  }

  // Try API key
  if (apiKey?.startsWith("sf_")) {
    try {
      const user = await validateApiKey(c.env.DATABASE, apiKey);
      c.set("user", user);
      await next();
      return;
    } catch (error) {
      // API key validation failed
    }
  }

  throw new HTTPException(401, {
    message: "Authentication required. Provide valid JWT Bearer token or X-API-Key header",
  });
}

/**
 * Optional Authentication Middleware
 * Sets user if authenticated, but doesn't require it
 */
export async function optionalAuth(c: Context<{ Bindings: AuthEnv }>, next: Next) {
  const authHeader = c.req.header("Authorization");
  const apiKey = c.req.header("X-API-Key");

  // Try JWT first
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    try {
      const user = await verifyJWT(token, c.env.JWT_SECRET);
      c.set("user", user);
    } catch (error) {
      // Silently fail for optional auth
    }
  }

  // Try API key
  if (apiKey?.startsWith("sf_")) {
    try {
      const user = await validateApiKey(c.env.DATABASE, apiKey);
      c.set("user", user);
    } catch (error) {
      // Silently fail for optional auth
    }
  }

  await next();
}

/**
 * Tier-based Access Control Middleware
 * Requires specific subscription tier
 */
export function requireTier(...allowedTiers: Array<"free" | "pro" | "team" | "enterprise">) {
  return async (c: Context<{ Bindings: AuthEnv }>, next: Next) => {
    const user = c.get("user") as AuthUser | undefined;

    if (!user) {
      throw new HTTPException(401, { message: "Authentication required" });
    }

    if (!allowedTiers.includes(user.tier)) {
      throw new HTTPException(403, {
        message: `This feature requires ${allowedTiers.join(" or ")} tier. Current tier: ${user.tier}`,
      });
    }

    await next();
  };
}

/**
 * Verify JWT token and extract user information
 */
async function verifyJWT(token: string, secret: string): Promise<AuthUser> {
  try {
    // Import the secret key
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    // Split JWT into parts
    const [headerB64, payloadB64, signatureB64] = token.split(".");
    if (!headerB64 || !payloadB64 || !signatureB64) {
      throw new Error("Invalid JWT format");
    }

    // Verify signature
    const dataToVerify = `${headerB64}.${payloadB64}`;
    const signature = base64UrlDecode(signatureB64);
    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      encoder.encode(dataToVerify)
    );

    if (!isValid) {
      throw new Error("Invalid JWT signature");
    }

    // Decode payload
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));

    // Check expiration
    if (payload.exp && payload.exp < Date.now() / 1000) {
      throw new Error("JWT expired");
    }

    return {
      userId: payload.sub || payload.userId,
      email: payload.email,
      tier: payload.tier || "free",
      organizationId: payload.organizationId,
    };
  } catch (error) {
    throw new Error(`JWT verification failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Validate API key against database
 */
async function validateApiKey(db: D1Database, apiKey: string): Promise<AuthUser> {
  // Hash the API key for lookup (we store hashed keys)
  const hashedKey = await hashApiKey(apiKey);

  const result = await db
    .prepare(
      `SELECT u.id, u.email, u.tier, u.organization_id
       FROM api_keys ak
       JOIN users u ON ak.user_id = u.id
       WHERE ak.key_hash = ? AND ak.revoked = 0 AND (ak.expires_at IS NULL OR ak.expires_at > ?)`
    )
    .bind(hashedKey, new Date().toISOString())
    .first();

  if (!result) {
    throw new Error("Invalid or revoked API key");
  }

  // Update last used timestamp
  await db
    .prepare(`UPDATE api_keys SET last_used_at = ? WHERE key_hash = ?`)
    .bind(new Date().toISOString(), hashedKey)
    .run();

  return {
    userId: result.id as string,
    email: result.email as string,
    tier: result.tier as "free" | "pro" | "team" | "enterprise",
    organizationId: result.organization_id as string | undefined,
  };
}

/**
 * Hash API key for secure storage
 */
async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

/**
 * Base64 URL decode helper
 */
function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Create JWT token (for testing and initial auth)
 */
export async function createJWT(
  payload: { userId: string; email: string; tier: string; organizationId?: string },
  secret: string,
  expiresIn = 3600 * 24 * 30 // 30 days default
): Promise<string> {
  const encoder = new TextEncoder();

  // Create header
  const header = {
    alg: "HS256",
    typ: "JWT",
  };

  // Create payload with expiration
  const now = Math.floor(Date.now() / 1000);
  const jwtPayload = {
    ...payload,
    sub: payload.userId,
    iat: now,
    exp: now + expiresIn,
  };

  // Encode header and payload
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(jwtPayload));

  // Create signature
  const dataToSign = `${headerB64}.${payloadB64}`;
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(dataToSign));
  const signatureB64 = base64UrlEncode(signature);

  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

/**
 * Base64 URL encode helper
 */
function base64UrlEncode(data: string | ArrayBuffer): string {
  let base64: string;
  if (typeof data === "string") {
    base64 = btoa(data);
  } else {
    base64 = btoa(String.fromCharCode(...new Uint8Array(data)));
  }
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Generate API key
 */
export function generateApiKey(): string {
  return generateApiKeyShared('sf_');
}
