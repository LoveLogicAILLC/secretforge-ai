
import { z } from 'zod';
import { SupportedServices } from './types';

export const EnvironmentSchema = z.enum(['dev', 'staging', 'prod', 'test']);

export const CreateSecretSchema = z.object({
  service: z.string().refine((val) => SupportedServices.includes(val) || val.startsWith('custom_'), {
    message: "Service must be one of the supported services or start with 'custom_'",
  }),
  environment: EnvironmentSchema,
  scopes: z.array(z.string()).optional().default([]),
  userId: z.string().min(1, "User ID is required"),
});

export const AnalyzeProjectSchema = z.object({
  projectPath: z.string(),
  dependencies: z.record(z.string()),
});

export const RotateSecretSchema = z.object({
  secretId: z.string().uuid().or(z.string().min(1)), // Supporting UUID or legacy IDs if any
});

export const SearchDocsSchema = z.object({
  service: z.string(),
  q: z.string().min(1),
});
