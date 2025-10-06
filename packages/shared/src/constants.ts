/**
 * Shared constants for SecretForge AI
 */

export const ENVIRONMENTS = ['dev', 'staging', 'prod'] as const;

export const COMPLIANCE_FRAMEWORKS = ['SOC2', 'GDPR', 'HIPAA', 'PCI_DSS'] as const;

export const SECRET_ACTIONS = ['created', 'retrieved', 'rotated', 'deleted', 'validated'] as const;

export const ROTATION_STATUSES = ['pending', 'completed', 'failed'] as const;

export const SERVICE_DETECTION_MAP: Record<string, string[]> = {
  stripe: ['stripe', '@stripe/stripe-js'],
  openai: ['openai', '@openai/api'],
  anthropic: ['@anthropic-ai/sdk'],
  aws: ['aws-sdk', '@aws-sdk'],
  supabase: ['@supabase/supabase-js'],
  sendgrid: ['@sendgrid/mail'],
  twilio: ['twilio'],
  github: ['@octokit/rest', 'octokit'],
  google: ['googleapis', '@google-cloud'],
  azure: ['@azure/identity', '@azure/keyvault-secrets'],
  mongodb: ['mongodb'],
  redis: ['redis', 'ioredis'],
  postgres: ['pg', 'postgres'],
};

export const DEFAULT_ROTATION_POLICY_DAYS = 90;

export const ENCRYPTION_ALGORITHM = 'AES-GCM';
export const ENCRYPTION_KEY_LENGTH = 32; // 256 bits
export const ENCRYPTION_IV_LENGTH = 12; // 96 bits for GCM

export const API_KEY_PREFIX_MAP: Record<string, string> = {
  stripe: 'sk_',
  openai: 'sk-',
  anthropic: 'sk-ant-',
  github: 'ghp_',
  aws: 'AKIA',
  supabase: 'sbp_',
};

export const ERROR_CODES = {
  SECRET_NOT_FOUND: 'SECRET_NOT_FOUND',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ENCRYPTION_FAILED: 'ENCRYPTION_FAILED',
  DECRYPTION_FAILED: 'DECRYPTION_FAILED',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  ROTATION_FAILED: 'ROTATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;
