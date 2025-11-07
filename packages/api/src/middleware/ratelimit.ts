/**
 * Rate Limiting Middleware for SecretForge API
 *
 * Implements sliding window rate limiting using Cloudflare KV
 */

import { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";

interface RateLimitEnv {
  SECRETS_VAULT: KVNamespace;
}

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyPrefix?: string; // Prefix for rate limit keys
  skipPaths?: string[]; // Paths to skip rate limiting
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60, // 60 requests per minute
  keyPrefix: "ratelimit:",
  skipPaths: ["/health"],
};

/**
 * Creates a rate limiting middleware with custom configuration
 */
export function rateLimitMiddleware(config: Partial<RateLimitConfig> = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  return async (c: Context<{ Bindings: RateLimitEnv }>, next: Next) => {
    // Skip rate limiting for configured paths
    if (finalConfig.skipPaths?.some((path) => c.req.path === path)) {
      return next();
    }

    // Get user identifier (IP or userId)
    const userId = c.get("userId");
    const ip = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown";
    const identifier = userId || ip;

    // Create rate limit key
    const key = `${finalConfig.keyPrefix}${identifier}`;

    // Get current window data
    const now = Date.now();
    const windowStart = now - finalConfig.windowMs;

    const rateLimitData = await c.env.SECRETS_VAULT.get(key);
    let requests: number[] = rateLimitData ? JSON.parse(rateLimitData) : [];

    // Remove requests outside the current window
    requests = requests.filter((timestamp) => timestamp > windowStart);

    // Check if rate limit exceeded
    if (requests.length >= finalConfig.maxRequests) {
      const oldestRequest = Math.min(...requests);
      const resetTime = oldestRequest + finalConfig.windowMs;
      const retryAfter = Math.ceil((resetTime - now) / 1000);

      throw new HTTPException(429, {
        message: "Rate limit exceeded",
        cause: {
          limit: finalConfig.maxRequests,
          window: `${finalConfig.windowMs / 1000}s`,
          retryAfter: `${retryAfter}s`,
        },
      });
    }

    // Add current request
    requests.push(now);

    // Store updated data with TTL
    await c.env.SECRETS_VAULT.put(key, JSON.stringify(requests), {
      expirationTtl: Math.ceil(finalConfig.windowMs / 1000) + 10, // Add 10s buffer
    });

    // Add rate limit headers
    c.res.headers.set("X-RateLimit-Limit", finalConfig.maxRequests.toString());
    c.res.headers.set("X-RateLimit-Remaining", (finalConfig.maxRequests - requests.length).toString());
    c.res.headers.set("X-RateLimit-Reset", new Date(now + finalConfig.windowMs).toISOString());

    await next();
  };
}

/**
 * Tier-based rate limiting configurations
 */
export const RATE_LIMIT_TIERS = {
  free: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10, // 10 requests per minute
  },
  pro: {
    windowMs: 60 * 1000,
    maxRequests: 100, // 100 requests per minute
  },
  team: {
    windowMs: 60 * 1000,
    maxRequests: 500, // 500 requests per minute
  },
  enterprise: {
    windowMs: 60 * 1000,
    maxRequests: 5000, // 5000 requests per minute
  },
};

/**
 * Dynamic rate limiting based on user tier
 */
export function dynamicRateLimitMiddleware() {
  return async (c: Context<{ Bindings: RateLimitEnv }>, next: Next) => {
    // Get user tier from context (set by auth middleware)
    const userId = c.get("userId");
    const userTier = c.get("userTier") || "free";

    // Get tier-specific config
    const tierConfig = RATE_LIMIT_TIERS[userTier as keyof typeof RATE_LIMIT_TIERS] || RATE_LIMIT_TIERS.free;

    // Apply rate limiting
    const middleware = rateLimitMiddleware({
      ...tierConfig,
      keyPrefix: `ratelimit:${userTier}:`,
    });

    return middleware(c, next);
  };
}

/**
 * Endpoint-specific rate limiting for expensive operations
 */
export function endpointRateLimitMiddleware(endpoint: string, config: Partial<RateLimitConfig>) {
  return rateLimitMiddleware({
    ...config,
    keyPrefix: `ratelimit:${endpoint}:`,
  });
}

/**
 * Burst protection - prevents spike attacks
 */
export function burstProtectionMiddleware(maxBurst: number = 20, windowMs: number = 1000) {
  return rateLimitMiddleware({
    windowMs,
    maxRequests: maxBurst,
    keyPrefix: "burst:",
  });
}
