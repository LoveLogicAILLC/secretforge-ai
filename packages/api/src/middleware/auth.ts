import { Context, Next } from 'hono';
import { createMiddleware } from 'hono/factory';

interface Env {
  DATABASE: D1Database;
}

interface AuthUser {
  userId: string;
  apiKey: string;
}

/**
 * Authentication middleware for SecretForge API
 * Validates API keys from Authorization header
 */
export const authMiddleware = createMiddleware<{ Bindings: Env; Variables: { user: AuthUser } }>(
  async (c, next) => {
    const authHeader = c.req.header('Authorization');

    if (!authHeader) {
      return c.json({ error: 'Missing Authorization header' }, 401);
    }

    // Support both "Bearer <token>" and just "<token>"
    const apiKey = authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : authHeader;

    if (!apiKey || apiKey.length < 32) {
      return c.json({ error: 'Invalid API key format' }, 401);
    }

    try {
      // Validate API key against database
      const result = await c.env.DATABASE.prepare(
        'SELECT user_id, api_key FROM api_keys WHERE api_key = ? AND is_active = 1'
      )
        .bind(apiKey)
        .first();

      if (!result) {
        return c.json({ error: 'Invalid or expired API key' }, 401);
      }

      // Set user context for downstream handlers
      c.set('user', {
        userId: result.user_id as string,
        apiKey: apiKey,
      });

      await next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      return c.json({ error: 'Authentication failed' }, 500);
    }
  }
);

/**
 * Optional auth middleware - allows requests without auth but sets user if present
 */
export const optionalAuthMiddleware = createMiddleware<{ Bindings: Env; Variables: { user?: AuthUser } }>(
  async (c, next) => {
    const authHeader = c.req.header('Authorization');

    if (authHeader) {
      const apiKey = authHeader.startsWith('Bearer ')
        ? authHeader.substring(7)
        : authHeader;

      try {
        const result = await c.env.DATABASE.prepare(
          'SELECT user_id, api_key FROM api_keys WHERE api_key = ? AND is_active = 1'
        )
          .bind(apiKey)
          .first();

        if (result) {
          c.set('user', {
            userId: result.user_id as string,
            apiKey: apiKey,
          });
        }
      } catch (error) {
        console.error('Optional auth error:', error);
      }
    }

    await next();
  }
);

/**
 * Generate a secure API key
 */
export function generateApiKey(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const base64 = btoa(String.fromCharCode(...array));
  return `sfk_${base64.replace(/[+/=]/g, (char) => {
    if (char === '+') return '-';
    if (char === '/') return '_';
    return '';
  })}`;
}
