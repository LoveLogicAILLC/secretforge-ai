import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createJWT, generateApiKey } from "../middleware/auth";
import { validateRequest } from "../middleware/errorHandler";
import {
  createUserSchema,
  loginSchema,
  createApiKeySchema,
  revokeApiKeySchema,
} from "../schemas/validation";
import { generateId } from "@secretforge/shared";

interface AuthEnv {
  DATABASE: D1Database;
  JWT_SECRET: string;
  ENCRYPTION_KEY: string;
}

const authRouter = new Hono<{ Bindings: AuthEnv }>();

/**
 * Sign up new user
 * POST /auth/signup
 */
authRouter.post("/signup", validateRequest(createUserSchema), async (c) => {
  const { email, password, tier } = c.get("validatedData");

  // Check if user already exists
  const existing = await c.env.DATABASE.prepare(
    "SELECT id FROM users WHERE email = ?"
  )
    .bind(email)
    .first();

  if (existing) {
    throw new HTTPException(409, { message: "Email already registered" });
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Create user
  const userId = generateId();
  await c.env.DATABASE.prepare(
    `INSERT INTO users (id, email, password_hash, tier, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(
      userId,
      email,
      passwordHash,
      tier,
      new Date().toISOString(),
      new Date().toISOString()
    )
    .run();

  // Create default user preferences
  await c.env.DATABASE.prepare(
    `INSERT INTO user_preferences (user_id, notification_email, compliance_frameworks)
     VALUES (?, ?, ?)`
  )
    .bind(userId, email, JSON.stringify(["SOC2"]))
    .run();

  // Generate JWT
  const token = await createJWT(
    {
      userId,
      email,
      tier,
    },
    c.env.JWT_SECRET
  );

  return c.json(
    {
      user: {
        id: userId,
        email,
        tier,
      },
      token,
    },
    201
  );
});

/**
 * Login
 * POST /auth/login
 */
authRouter.post("/login", validateRequest(loginSchema), async (c) => {
  const { email, password } = c.get("validatedData");

  // Find user
  const user = await c.env.DATABASE.prepare(
    "SELECT id, email, password_hash, tier, organization_id FROM users WHERE email = ? AND is_active = 1"
  )
    .bind(email)
    .first();

  if (!user) {
    throw new HTTPException(401, { message: "Invalid credentials" });
  }

  // Verify password
  const isValid = await verifyPassword(password, user.password_hash as string);
  if (!isValid) {
    throw new HTTPException(401, { message: "Invalid credentials" });
  }

  // Update last login
  await c.env.DATABASE.prepare("UPDATE users SET last_login_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), user.id)
    .run();

  // Generate JWT
  const token = await createJWT(
    {
      userId: user.id as string,
      email: user.email as string,
      tier: user.tier as string,
      organizationId: user.organization_id as string | undefined,
    },
    c.env.JWT_SECRET
  );

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      tier: user.tier,
      organizationId: user.organization_id,
    },
    token,
  });
});

/**
 * Get current user
 * GET /auth/me
 */
authRouter.get("/me", async (c) => {
  const user = c.get("user");

  if (!user) {
    throw new HTTPException(401, { message: "Not authenticated" });
  }

  // Get full user details
  const userDetails = await c.env.DATABASE.prepare(
    "SELECT id, email, tier, organization_id, created_at FROM users WHERE id = ?"
  )
    .bind(user.userId)
    .first();

  if (!userDetails) {
    throw new HTTPException(404, { message: "User not found" });
  }

  return c.json({
    user: userDetails,
  });
});

/**
 * Create API key
 * POST /auth/api-keys
 */
authRouter.post("/api-keys", validateRequest(createApiKeySchema), async (c) => {
  const user = c.get("user");
  if (!user) {
    throw new HTTPException(401, { message: "Not authenticated" });
  }

  const { name, scopes, expiresIn } = c.get("validatedData");

  // Generate API key
  const apiKey = generateApiKey();
  const keyHash = await hashApiKey(apiKey);

  // Calculate expiration
  const expiresAt = expiresIn
    ? new Date(Date.now() + expiresIn * 24 * 60 * 60 * 1000).toISOString()
    : null;

  // Store API key
  const keyId = generateId();
  await c.env.DATABASE.prepare(
    `INSERT INTO api_keys (id, user_id, key_hash, name, scopes, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      keyId,
      user.userId,
      keyHash,
      name,
      JSON.stringify(scopes),
      new Date().toISOString(),
      expiresAt
    )
    .run();

  return c.json(
    {
      apiKey: {
        id: keyId,
        name,
        key: apiKey, // Only shown once!
        scopes,
        expiresAt,
      },
    },
    201
  );
});

/**
 * List API keys
 * GET /auth/api-keys
 */
authRouter.get("/api-keys", async (c) => {
  const user = c.get("user");
  if (!user) {
    throw new HTTPException(401, { message: "Not authenticated" });
  }

  const keys = await c.env.DATABASE.prepare(
    `SELECT id, name, scopes, created_at, expires_at, last_used_at, revoked
     FROM api_keys
     WHERE user_id = ?
     ORDER BY created_at DESC`
  )
    .bind(user.userId)
    .all();

  return c.json({
    apiKeys: keys.results.map((key) => ({
      ...key,
      scopes: JSON.parse((key.scopes as string) || "[]"),
    })),
  });
});

/**
 * Revoke API key
 * DELETE /auth/api-keys/:id
 */
authRouter.delete("/api-keys/:id", async (c) => {
  const user = c.get("user");
  if (!user) {
    throw new HTTPException(401, { message: "Not authenticated" });
  }

  const keyId = c.req.param("id");

  // Verify ownership
  const key = await c.env.DATABASE.prepare(
    "SELECT id FROM api_keys WHERE id = ? AND user_id = ?"
  )
    .bind(keyId, user.userId)
    .first();

  if (!key) {
    throw new HTTPException(404, { message: "API key not found" });
  }

  // Revoke key
  await c.env.DATABASE.prepare("UPDATE api_keys SET revoked = 1 WHERE id = ?")
    .bind(keyId)
    .run();

  return c.json({ message: "API key revoked successfully" });
});

/**
 * Refresh JWT token
 * POST /auth/refresh
 */
authRouter.post("/refresh", async (c) => {
  const user = c.get("user");
  if (!user) {
    throw new HTTPException(401, { message: "Not authenticated" });
  }

  // Generate new JWT
  const token = await createJWT(
    {
      userId: user.userId,
      email: user.email,
      tier: user.tier,
      organizationId: user.organizationId,
    },
    c.env.JWT_SECRET
  );

  return c.json({ token });
});

/**
 * Hash password using SHA-256
 */
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

/**
 * Verify password
 */
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const passwordHash = await hashPassword(password);
  return passwordHash === hash;
}

/**
 * Hash API key
 */
async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

export default authRouter;
