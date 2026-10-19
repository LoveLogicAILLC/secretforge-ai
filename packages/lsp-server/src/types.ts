/**
 * SecretForge LSP Server type definitions
 */

import { DiagnosticSeverity } from "vscode-languageserver/node";

export interface SecretPattern {
  regex: RegExp;
  type: string;
  service: string;
  severity: DiagnosticSeverity;
  description?: string;
  remediation?: string;
}

export interface ValidationResult {
  valid: boolean;
  recommendations: string[];
  score: number;
  service?: string;
  compliance?: {
    SOC2?: boolean;
    GDPR?: boolean;
    HIPAA?: boolean;
    PCIDSS?: boolean;
  };
}

export interface ProvisionedSecret {
  id: string;
  service: string;
  environment: string;
  createdAt: string;
  envVarName?: string;
}

export interface SecretDetection {
  pattern: SecretPattern;
  value: string;
  line: number;
  column: number;
  length: number;
}

/**
 * Attached to each Diagnostic so code actions and hovers can recover
 * the originating pattern without re-scanning the document.
 */
export interface DiagnosticData {
  pattern: string;
  service: string;
  masked: string;
  fullMatch: string;
}

export interface LSPInitializationOptions {
  apiUrl?: string;
  apiKey?: string;
  enableAutocomplete?: boolean;
  enableHover?: boolean;
  enableCodeActions?: boolean;
  enableDiagnostics?: boolean;
}
