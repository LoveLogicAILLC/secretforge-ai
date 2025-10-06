/**
 * Shared utility functions
 */

import { SERVICE_DETECTION_MAP, API_KEY_PREFIX_MAP } from './constants';
import type { Environment } from './types';

/**
 * Detect required services from project dependencies
 */
export function detectServicesFromDependencies(dependencies: Record<string, string>): string[] {
  const detected: string[] = [];

  for (const [service, packages] of Object.entries(SERVICE_DETECTION_MAP)) {
    if (packages.some((pkg) => Object.keys(dependencies).some((d) => d.includes(pkg)))) {
      detected.push(service);
    }
  }

  return [...new Set(detected)]; // Remove duplicates
}

/**
 * Generate a secure random API key for a service
 */
export function generateApiKey(service: string, length: number = 32): string {
  const prefix = API_KEY_PREFIX_MAP[service] || 'sk_';
  const randomBytes = new Uint8Array(length);
  crypto.getRandomValues(randomBytes);
  const randomString = btoa(String.fromCharCode(...randomBytes))
    .replace(/[+/=]/g, '')
    .slice(0, length);

  return `${prefix}${service}_${randomString}`;
}

/**
 * Mask sensitive data for logging
 */
export function maskSecret(secret: string, visibleChars: number = 4): string {
  if (secret.length <= visibleChars * 2) {
    return '*'.repeat(secret.length);
  }

  const start = secret.slice(0, visibleChars);
  const end = secret.slice(-visibleChars);
  const masked = '*'.repeat(secret.length - visibleChars * 2);

  return `${start}${masked}${end}`;
}

/**
 * Validate environment string
 */
export function isValidEnvironment(env: string): env is Environment {
  return ['dev', 'staging', 'prod'].includes(env);
}

/**
 * Calculate days until rotation is due
 */
export function daysUntilRotation(lastRotated: string, policyDays: number): number {
  const lastRotatedDate = new Date(lastRotated);
  const now = new Date();
  const daysSinceRotation = Math.floor(
    (now.getTime() - lastRotatedDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  return Math.max(0, policyDays - daysSinceRotation);
}

/**
 * Check if rotation is overdue
 */
export function isRotationOverdue(lastRotated: string, policyDays: number): boolean {
  return daysUntilRotation(lastRotated, policyDays) === 0;
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Sanitize user input
 */
export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '')
    .slice(0, 1000); // Max length
}

/**
 * Generate unique ID
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Sleep utility for async operations
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry utility with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delayMs?: number;
    backoffMultiplier?: number;
  } = {}
): Promise<T> {
  const { maxAttempts = 3, delayMs = 1000, backoffMultiplier = 2 } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxAttempts) {
        const delay = delayMs * Math.pow(backoffMultiplier, attempt - 1);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}
