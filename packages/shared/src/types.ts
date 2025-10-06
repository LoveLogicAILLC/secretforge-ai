/**
 * Shared TypeScript types for SecretForge AI
 */

export type Environment = 'dev' | 'staging' | 'prod';

export type ComplianceFramework = 'SOC2' | 'GDPR' | 'HIPAA' | 'PCI_DSS';

export type SecretAction = 'created' | 'retrieved' | 'rotated' | 'deleted' | 'validated';

export type RotationStatus = 'pending' | 'completed' | 'failed';

export interface Secret {
  id: string;
  service: string;
  environment: Environment;
  scopes: string[];
  created: string;
  lastRotated?: string;
  userId: string;
}

export interface SecretMetadata {
  service: string;
  environment: Environment;
  scopes: string[];
  created: string;
  lastRotated?: string;
}

export interface AuditLog {
  id: string;
  secretId: string;
  userId: string;
  action: SecretAction;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

export interface ServiceConfig {
  service: string;
  providerName: string;
  apiBaseUrl?: string;
  authType: 'bearer' | 'api_key' | 'oauth2';
  defaultScopes?: string[];
  documentationUrl?: string;
  rotationSupported: boolean;
  metadata?: Record<string, any>;
}

export interface UserPreferences {
  userId: string;
  defaultEnvironment: Environment;
  autoRotationEnabled: boolean;
  notificationEmail?: string;
  complianceFrameworks: ComplianceFramework[];
  createdAt: string;
  updatedAt: string;
}

export interface RotationSchedule {
  id: string;
  secretId: string;
  scheduledFor: string;
  completedAt?: string;
  status: RotationStatus;
  errorMessage?: string;
}

export interface ComplianceValidation {
  id: string;
  secretId: string;
  framework: ComplianceFramework;
  isCompliant: boolean;
  validationResults: {
    checks: Array<{
      name: string;
      passed: boolean;
      message?: string;
    }>;
  };
  validatedAt: string;
}

export interface ProjectContext {
  projectPath: string;
  dependencies: Record<string, string>;
  envVars: Record<string, string>;
  gitRemote?: string;
}

export interface AnalysisResult {
  detectedServices: string[];
  recommendations: string;
  missingKeys: string[];
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}
