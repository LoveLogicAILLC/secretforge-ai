/**
 * Zod schemas for validation
 */

import { z } from 'zod';

export const EnvironmentSchema = z.enum(['dev', 'staging', 'prod']);

export const ComplianceFrameworkSchema = z.enum(['SOC2', 'GDPR', 'HIPAA', 'PCI_DSS']);

export const SecretActionSchema = z.enum(['created', 'retrieved', 'rotated', 'deleted', 'validated']);

export const CreateSecretSchema = z.object({
  service: z.string().min(1),
  environment: EnvironmentSchema,
  scopes: z.array(z.string()).optional().default([]),
  userId: z.string().min(1),
});

export const RotateSecretSchema = z.object({
  secretId: z.string().uuid(),
});

export const ValidateSecretSchema = z.object({
  secretId: z.string().uuid(),
  framework: ComplianceFrameworkSchema,
});

export const AnalyzeProjectSchema = z.object({
  projectPath: z.string().min(1),
  dependencies: z.record(z.string()).optional().default({}),
});

export const SearchDocumentationSchema = z.object({
  service: z.string().min(1),
  query: z.string().min(1),
});

export const AuditLogSchema = z.object({
  secretId: z.string().uuid(),
  userId: z.string().min(1),
  action: SecretActionSchema,
  ipAddress: z.string().ip().optional(),
  userAgent: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export const UserPreferencesSchema = z.object({
  userId: z.string().min(1),
  defaultEnvironment: EnvironmentSchema.optional(),
  autoRotationEnabled: z.boolean().optional(),
  notificationEmail: z.string().email().optional(),
  complianceFrameworks: z.array(ComplianceFrameworkSchema).optional(),
});

export type CreateSecretInput = z.infer<typeof CreateSecretSchema>;
export type RotateSecretInput = z.infer<typeof RotateSecretSchema>;
export type ValidateSecretInput = z.infer<typeof ValidateSecretSchema>;
export type AnalyzeProjectInput = z.infer<typeof AnalyzeProjectSchema>;
export type SearchDocumentationInput = z.infer<typeof SearchDocumentationSchema>;
export type AuditLogInput = z.infer<typeof AuditLogSchema>;
export type UserPreferencesInput = z.infer<typeof UserPreferencesSchema>;
