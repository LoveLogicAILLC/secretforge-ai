/**
 * Request Validation Middleware for SecretForge API
 *
 * Uses Zod schemas to validate request bodies, query parameters, and path params
 */

import { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

/**
 * Validates request body against a Zod schema
 */
export function validateBody<T extends z.ZodType>(schema: T) {
  return async (c: Context, next: Next) => {
    try {
      const body = await c.req.json();
      const validated = schema.parse(body);
      c.set("validatedBody", validated);
      await next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new HTTPException(400, {
          message: "Validation failed",
          cause: formatZodError(error),
        });
      }
      throw new HTTPException(400, {
        message: "Invalid request body",
      });
    }
  };
}

/**
 * Validates query parameters against a Zod schema
 */
export function validateQuery<T extends z.ZodType>(schema: T) {
  return async (c: Context, next: Next) => {
    try {
      const query = c.req.query();
      const validated = schema.parse(query);
      c.set("validatedQuery", validated);
      await next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new HTTPException(400, {
          message: "Invalid query parameters",
          cause: formatZodError(error),
        });
      }
      throw new HTTPException(400, {
        message: "Invalid query parameters",
      });
    }
  };
}

/**
 * Validates path parameters against a Zod schema
 */
export function validateParams<T extends z.ZodType>(schema: T) {
  return async (c: Context, next: Next) => {
    try {
      const params = c.req.param();
      const validated = schema.parse(params);
      c.set("validatedParams", validated);
      await next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new HTTPException(400, {
          message: "Invalid path parameters",
          cause: formatZodError(error),
        });
      }
      throw new HTTPException(400, {
        message: "Invalid path parameters",
      });
    }
  };
}

/**
 * Formats Zod errors for user-friendly responses
 */
function formatZodError(error: z.ZodError): Record<string, string[]> {
  const formatted: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.join(".");
    if (!formatted[path]) {
      formatted[path] = [];
    }
    formatted[path].push(issue.message);
  }

  return formatted;
}

// ====================
// Schema Definitions
// ====================

export const CreateSecretSchema = z.object({
  service: z.string().min(1, "Service name is required"),
  environment: z.enum(["development", "staging", "production"]).default("development"),
  scopes: z.array(z.string()).optional().default([]),
  userId: z.string().uuid("User ID must be a valid UUID"),
  value: z.string().optional(), // Optional if auto-generating
});

export const AnalyzeProjectSchema = z.object({
  projectPath: z.string().optional(),
  dependencies: z.record(z.string()).refine(
    (deps) => Object.keys(deps).length > 0,
    "At least one dependency is required"
  ),
});

export const RotateSecretSchema = z.object({
  force: z.boolean().optional().default(false),
});

export const SearchDocsSchema = z.object({
  service: z.string().min(1, "Service name is required"),
  q: z.string().min(3, "Query must be at least 3 characters"),
  limit: z.coerce.number().int().min(1).max(20).optional().default(5),
});

export const ValidateComplianceSchema = z.object({
  framework: z.enum(["SOC2", "GDPR", "HIPAA", "PCI-DSS"]).optional().default("SOC2"),
});

export const AgentChatSchema = z.object({
  message: z.string().min(1, "Message is required"),
  userId: z.string().min(1, "User ID is required"),
  context: z.record(z.any()).optional(),
});

export const SecretIdSchema = z.object({
  id: z.string().uuid("Secret ID must be a valid UUID"),
});

/**
 * Sanitizes user input to prevent injection attacks
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, "") // Remove HTML tags
    .replace(/[;'"`]/g, "") // Remove SQL/shell metacharacters
    .trim();
}

/**
 * Validates file upload size and type
 */
export function validateFileUpload(
  file: File,
  options: {
    maxSize?: number;
    allowedTypes?: string[];
  } = {}
): { valid: boolean; error?: string } {
  const maxSize = options.maxSize || 10 * 1024 * 1024; // 10MB default
  const allowedTypes = options.allowedTypes || ["application/json", "text/plain"];

  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File size exceeds maximum of ${maxSize / 1024 / 1024}MB`,
    };
  }

  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `File type ${file.type} is not allowed. Allowed types: ${allowedTypes.join(", ")}`,
    };
  }

  return { valid: true };
}
