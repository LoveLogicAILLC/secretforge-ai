import { z } from "zod";

/**
 * User schemas
 */
export const createUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  tier: z.enum(["free", "pro", "team", "enterprise"]).default("free"),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

/**
 * Secret schemas
 */
export const createSecretSchema = z.object({
  service: z.string().min(1, "Service name is required"),
  environment: z.enum(["development", "staging", "production"]).default("development"),
  scopes: z.array(z.string()).optional().default([]),
  value: z.string().optional(), // Optional custom value
  metadata: z.record(z.any()).optional(),
});

export const updateSecretSchema = z.object({
  scopes: z.array(z.string()).optional(),
  environment: z.enum(["development", "staging", "production"]).optional(),
  metadata: z.record(z.any()).optional(),
});

export const rotateSecretSchema = z.object({
  gracePeriodHours: z.number().min(0).max(168).optional(), // Max 1 week
  notifyChannels: z.array(z.enum(["email", "slack", "webhook"])).optional(),
});

/**
 * Analysis schemas
 */
export const analyzeProjectSchema = z.object({
  projectPath: z.string().optional(),
  dependencies: z.record(z.string()).optional(),
  packageManager: z.enum(["npm", "yarn", "pnpm", "pip", "go", "bundler", "composer"]).optional(),
  language: z.enum(["javascript", "typescript", "python", "go", "ruby", "php"]).optional(),
});

/**
 * Compliance schemas
 */
export const validateComplianceSchema = z.object({
  framework: z.enum(["SOC2", "GDPR", "HIPAA", "PCI-DSS"]).default("SOC2"),
  includeRecommendations: z.boolean().default(true),
});

/**
 * API Key schemas
 */
export const createApiKeySchema = z.object({
  name: z.string().min(1, "API key name is required"),
  scopes: z.array(z.string()).optional().default(["read", "write"]),
  expiresIn: z.number().positive().optional(), // Days until expiration
});

export const revokeApiKeySchema = z.object({
  keyId: z.string().uuid("Invalid API key ID"),
});

/**
 * Organization schemas
 */
export const createOrganizationSchema = z.object({
  name: z.string().min(1, "Organization name is required"),
  tier: z.enum(["team", "enterprise"]).default("team"),
});

export const inviteMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["owner", "admin", "member", "viewer"]).default("member"),
});

/**
 * Agent chat schemas
 */
export const chatMessageSchema = z.object({
  message: z.string().min(1, "Message cannot be empty").max(2000, "Message too long"),
  context: z.object({
    projectPath: z.string().optional(),
    currentSecrets: z.array(z.string()).optional(),
    recentActivity: z.array(z.any()).optional(),
  }).optional(),
});

/**
 * Webhook schemas
 */
export const createWebhookSchema = z.object({
  url: z.string().url("Invalid webhook URL"),
  events: z.array(z.enum([
    "secret.created",
    "secret.rotated",
    "secret.deleted",
    "secret.accessed",
    "compliance.violation",
    "usage.limit_reached",
  ])),
  secret: z.string().optional(), // For signature verification
});

/**
 * Rotation policy schemas
 */
export const createRotationPolicySchema = z.object({
  secretId: z.string().uuid("Invalid secret ID"),
  intervalDays: z.number().min(1).max(365),
  autoRotate: z.boolean().default(true),
  gracePeriodHours: z.number().min(0).max(168).default(24),
  notifyBefore: z.number().min(0).max(48).default(24), // Hours before rotation
});

/**
 * Search schemas
 */
export const searchDocsSchema = z.object({
  service: z.string().min(1, "Service name is required"),
  query: z.string().min(1, "Search query is required").max(500),
  limit: z.number().min(1).max(20).default(5),
});

/**
 * Usage schemas
 */
export const getUsageSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  groupBy: z.enum(["day", "week", "month"]).default("day"),
});

/**
 * Audit log schemas
 */
export const getAuditLogsSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  action: z.enum([
    "secret.created",
    "secret.accessed",
    "secret.rotated",
    "secret.deleted",
    "user.login",
    "apikey.created",
    "apikey.revoked",
  ]).optional(),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
});

/**
 * Batch operations schemas
 */
export const batchCreateSecretsSchema = z.object({
  secrets: z.array(createSecretSchema).min(1).max(10),
});

export const batchRotateSecretsSchema = z.object({
  secretIds: z.array(z.string().uuid()).min(1).max(50),
  gracePeriodHours: z.number().min(0).max(168).optional(),
});

/**
 * Export schemas
 */
export const exportSecretsSchema = z.object({
  format: z.enum(["json", "env", "yaml"]).default("json"),
  environment: z.enum(["development", "staging", "production"]).optional(),
  includeValues: z.boolean().default(false), // For security, default to excluding values
});

/**
 * Type exports
 */
export type CreateUser = z.infer<typeof createUserSchema>;
export type Login = z.infer<typeof loginSchema>;
export type CreateSecret = z.infer<typeof createSecretSchema>;
export type UpdateSecret = z.infer<typeof updateSecretSchema>;
export type RotateSecret = z.infer<typeof rotateSecretSchema>;
export type AnalyzeProject = z.infer<typeof analyzeProjectSchema>;
export type ValidateCompliance = z.infer<typeof validateComplianceSchema>;
export type CreateApiKey = z.infer<typeof createApiKeySchema>;
export type CreateOrganization = z.infer<typeof createOrganizationSchema>;
export type InviteMember = z.infer<typeof inviteMemberSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type CreateWebhook = z.infer<typeof createWebhookSchema>;
export type CreateRotationPolicy = z.infer<typeof createRotationPolicySchema>;
export type SearchDocs = z.infer<typeof searchDocsSchema>;
export type GetUsage = z.infer<typeof getUsageSchema>;
export type GetAuditLogs = z.infer<typeof getAuditLogsSchema>;
export type ExportSecrets = z.infer<typeof exportSecretsSchema>;
