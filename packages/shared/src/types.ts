
export interface Secret {
  id: string;
  service: string;
  environment: Environment;
  scopes: string[];
  created: string;
  lastRotated?: string;
  userId: string;
  value?: string; // Optional because usually encrypted or masked in responses
}

export type Environment = 'dev' | 'staging' | 'prod' | 'test';

export interface CreateSecretRequest {
  service: string;
  environment: Environment;
  scopes: string[];
  userId: string;
}

export interface AnalyzeProjectRequest {
  projectPath: string;
  dependencies: Record<string, string>;
}

export interface AnalyzeProjectResponse {
  detectedServices: string[];
  recommendations: string;
  missingKeys: string[];
}

export const ServiceMap: Record<string, string[]> = {
  stripe: ["stripe", "@stripe/stripe-js"],
  openai: ["openai"],
  anthropic: ["@anthropic-ai/sdk"],
  supabase: ["@supabase/supabase-js"],
  aws: ["aws-sdk", "@aws-sdk"],
  sendgrid: ["@sendgrid/mail"],
  twilio: ["twilio"],
  resend: ["resend"],
  firebase: ["firebase", "firebase-admin"],
  vercel: ["vercel"],
  cloudflare: ["cloudflare"],
};

export const SupportedServices = Object.keys(ServiceMap);
