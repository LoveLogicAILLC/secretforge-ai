import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';

export interface RateLimitEnv {
  RATE_LIMIT_KV: KVNamespace;
}

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  max: number; // Max requests per window
  keyPrefix?: string; // Prefix for KV keys
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

/**
 * Rate limiting middleware using Cloudflare KV
 * Implements sliding window algorithm
 */
export function rateLimit(config: RateLimitConfig) {
  const {
    windowMs,
    max,
    keyPrefix = 'rl',
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = config;

  return async (c: Context<{ Bindings: RateLimitEnv }>, next: Next) => {
    // Get identifier (user ID, API key, or IP)
    const identifier = getIdentifier(c);
    const key = `${keyPrefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Get current rate limit data
    const data = await c.env.RATE_LIMIT_KV?.get(key, 'json');
    const requests: number[] = (data as number[]) || [];

    // Filter out requests outside the current window
    const recentRequests = requests.filter((timestamp) => timestamp > windowStart);

    // Check if limit exceeded
    if (recentRequests.length >= max) {
      const oldestRequest = Math.min(...recentRequests);
      const resetTime = oldestRequest + windowMs;
      const retryAfter = Math.ceil((resetTime - now) / 1000);

      c.header('X-RateLimit-Limit', max.toString());
      c.header('X-RateLimit-Remaining', '0');
      c.header('X-RateLimit-Reset', new Date(resetTime).toISOString());
      c.header('Retry-After', retryAfter.toString());

      throw new HTTPException(429, {
        message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
      });
    }

    // Add current request timestamp
    recentRequests.push(now);

    // Store updated rate limit data
    await c.env.RATE_LIMIT_KV?.put(key, JSON.stringify(recentRequests), {
      expirationTtl: Math.ceil(windowMs / 1000),
    });

    // Set rate limit headers
    c.header('X-RateLimit-Limit', max.toString());
    c.header('X-RateLimit-Remaining', (max - recentRequests.length).toString());
    c.header('X-RateLimit-Reset', new Date(now + windowMs).toISOString());

    // Execute request
    await next();

    // Remove request from count if configured
    const status = c.res.status;
    const shouldRemove =
      (skipSuccessfulRequests && status < 400) || (skipFailedRequests && status >= 400);

    if (shouldRemove) {
      const updatedRequests = recentRequests.slice(0, -1);
      await c.env.RATE_LIMIT_KV?.put(key, JSON.stringify(updatedRequests), {
        expirationTtl: Math.ceil(windowMs / 1000),
      });
    }
  };
}

/**
 * Get unique identifier for rate limiting
 */
function getIdentifier(c: Context): string {
  // Try to get user ID from auth
  const user = c.get('user');
  if (user && user.userId) {
    return `user:${user.userId}`;
  }

  // Try to get API key
  const apiKey = c.req.header('X-API-Key');
  if (apiKey) {
    return `apikey:${apiKey.substring(0, 16)}`;
  }

  // Fall back to IP address
  const ip =
    c.req.header('CF-Connecting-IP') ||
    c.req.header('X-Forwarded-For') ||
    c.req.header('X-Real-IP') ||
    'unknown';

  return `ip:${ip}`;
}

/**
 * Tier-based rate limiting
 * Different limits for different subscription tiers
 */
export function tierRateLimit() {
  const limits = {
    free: { windowMs: 60 * 1000, max: 10 }, // 10 req/min
    pro: { windowMs: 60 * 1000, max: 100 }, // 100 req/min
    team: { windowMs: 60 * 1000, max: 500 }, // 500 req/min
    enterprise: { windowMs: 60 * 1000, max: 5000 }, // 5000 req/min
  };

  return async (c: Context<{ Bindings: RateLimitEnv }>, next: Next) => {
    const user = c.get('user');
    const tier = user?.tier || 'free';
    const config = limits[tier];

    const rateLimiter = rateLimit({
      ...config,
      keyPrefix: `tier-rl:${tier}`,
    });

    return rateLimiter(c, next);
  };
}

/**
 * IP-based rate limiting for unauthenticated endpoints
 */
export function ipRateLimit(windowMs = 60000, max = 20) {
  return rateLimit({
    windowMs,
    max,
    keyPrefix: 'ip-rl',
  });
}

/**
 * Endpoint-specific rate limiting
 */
export function endpointRateLimit(endpoint: string, windowMs = 60000, max = 30) {
  return async (c: Context<{ Bindings: RateLimitEnv }>, next: Next) => {
    const identifier = getIdentifier(c);
    const key = `endpoint-rl:${endpoint}:${identifier}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    const data = await c.env.RATE_LIMIT_KV?.get(key, 'json');
    const requests: number[] = (data as number[]) || [];
    const recentRequests = requests.filter((timestamp) => timestamp > windowStart);

    if (recentRequests.length >= max) {
      const oldestRequest = Math.min(...recentRequests);
      const resetTime = oldestRequest + windowMs;
      const retryAfter = Math.ceil((resetTime - now) / 1000);

      throw new HTTPException(429, {
        message: `Rate limit exceeded for ${endpoint}. Try again in ${retryAfter} seconds.`,
      });
    }

    recentRequests.push(now);
    await c.env.RATE_LIMIT_KV?.put(key, JSON.stringify(recentRequests), {
      expirationTtl: Math.ceil(windowMs / 1000),
    });

    await next();
  };
}
