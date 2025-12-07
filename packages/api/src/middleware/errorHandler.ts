import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { generateId } from "@secretforge/shared";

export interface ErrorResponse {
  error: {
    message: string;
    code: string;
    details?: any;
    requestId?: string;
    timestamp: string;
  };
}

/**
 * Global error handler middleware
 * Catches all errors and returns standardized error responses
 */
export async function errorHandler(err: Error, c: Context): Promise<Response> {
  const requestId = generateId();
  const timestamp = new Date().toISOString();

  // Log error for debugging
  console.error("Error:", {
    requestId,
    timestamp,
    error: err.message,
    stack: err.stack,
    path: c.req.path,
    method: c.req.method,
  });

  // Handle HTTP exceptions
  if (err instanceof HTTPException) {
    const response: ErrorResponse = {
      error: {
        message: err.message,
        code: getErrorCode(err.status),
        requestId,
        timestamp,
      },
    };

    return c.json(response, err.status);
  }

  // Handle validation errors
  if (err.name === "ZodError") {
    const response: ErrorResponse = {
      error: {
        message: "Validation failed",
        code: "VALIDATION_ERROR",
        details: (err as any).errors,
        requestId,
        timestamp,
      },
    };

    return c.json(response, 400);
  }

  // Handle database errors
  if (err.message.includes("D1_ERROR") || err.message.includes("database")) {
    const response: ErrorResponse = {
      error: {
        message: "Database operation failed",
        code: "DATABASE_ERROR",
        requestId,
        timestamp,
      },
    };

    return c.json(response, 500);
  }

  // Handle encryption errors
  if (err.message.includes("encrypt") || err.message.includes("decrypt")) {
    const response: ErrorResponse = {
      error: {
        message: "Encryption operation failed",
        code: "ENCRYPTION_ERROR",
        requestId,
        timestamp,
      },
    };

    return c.json(response, 500);
  }

  // Handle external API errors
  if (err.message.includes("OpenAI") || err.message.includes("API")) {
    const response: ErrorResponse = {
      error: {
        message: "External service temporarily unavailable",
        code: "EXTERNAL_SERVICE_ERROR",
        requestId,
        timestamp,
      },
    };

    return c.json(response, 503);
  }

  // Default internal server error
  const response: ErrorResponse = {
    error: {
      message: "An unexpected error occurred",
      code: "INTERNAL_SERVER_ERROR",
      requestId,
      timestamp,
    },
  };

  return c.json(response, 500);
}

/**
 * Get error code from HTTP status
 */
function getErrorCode(status: number): string {
  const codes: Record<number, string> = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    429: "RATE_LIMIT_EXCEEDED",
    500: "INTERNAL_SERVER_ERROR",
    503: "SERVICE_UNAVAILABLE",
  };

  return codes[status] || "UNKNOWN_ERROR";
}

/**
 * Request validation middleware
 * Validates request body against Zod schema
 */
export function validateRequest(schema: any) {
  return async (c: Context, next: any) => {
    try {
      const body = await c.req.json();
      const validated = schema.parse(body);
      c.set("validatedData", validated);
      await next();
    } catch (error) {
      if (error instanceof Error && error.name === "ZodError") {
        throw error;
      }
      throw new HTTPException(400, { message: "Invalid request body" });
    }
  };
}

/**
 * Request logging middleware
 * Logs all incoming requests
 */
export async function requestLogger(c: Context, next: any) {
  const start = Date.now();
  const requestId = generateId();

  c.set("requestId", requestId);

  console.log("Request:", {
    requestId,
    method: c.req.method,
    path: c.req.path,
    query: c.req.query(),
    ip: c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For"),
    userAgent: c.req.header("User-Agent"),
  });

  await next();

  const duration = Date.now() - start;

  console.log("Response:", {
    requestId,
    status: c.res.status,
    duration: `${duration}ms`,
  });
}

/**
 * Security headers middleware
 * Adds security-related HTTP headers
 */
export async function securityHeaders(c: Context, next: any) {
  await next();

  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-XSS-Protection", "1; mode=block");
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';"
  );
}

/**
 * CORS middleware with proper configuration
 */
export function corsMiddleware() {
  return async (c: Context, next: any) => {
    const origin = c.req.header("Origin");
    const allowedOrigins = [
      "http://localhost:3000",
      "http://localhost:5173",
      "https://secretforge.ai",
      "https://app.secretforge.ai",
    ];

    if (origin && allowedOrigins.includes(origin)) {
      c.header("Access-Control-Allow-Origin", origin);
      c.header("Access-Control-Allow-Credentials", "true");
    }

    c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    c.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-API-Key, X-Request-ID"
    );
    c.header("Access-Control-Max-Age", "86400");

    if (c.req.method === "OPTIONS") {
      return c.text("", 204);
    }

    await next();
  };
}

/**
 * Not found handler
 */
export function notFoundHandler(c: Context) {
  const response: ErrorResponse = {
    error: {
      message: "Endpoint not found",
      code: "NOT_FOUND",
      requestId: c.get("requestId") || generateId(),
      timestamp: new Date().toISOString(),
    },
  };

  return c.json(response, 404);
}

/**
 * Request timeout middleware
 */
export function timeout(ms: number = 30000) {
  return async (c: Context, next: any) => {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new HTTPException(408, { message: "Request timeout" }));
      }, ms);
    });

    try {
      await Promise.race([next(), timeoutPromise]);
    } catch (error) {
      throw error;
    }
  };
}

/**
 * Body size limit middleware
 */
export function bodyLimit(maxBytes: number = 1024 * 1024) {
  return async (c: Context, next: any) => {
    const contentLength = c.req.header("Content-Length");

    if (contentLength && parseInt(contentLength) > maxBytes) {
      throw new HTTPException(413, {
        message: `Request body too large. Maximum size: ${maxBytes} bytes`,
      });
    }

    await next();
  };
}
