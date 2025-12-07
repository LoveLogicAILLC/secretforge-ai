/**
 * Shared cryptography utilities for SecretForge
 * 
 * This module provides encryption/decryption functions compatible with both
 * Web Crypto API (Cloudflare Workers) and Node.js crypto module.
 */

/**
 * Generate a cryptographically secure random API key
 * @param prefix - Optional prefix for the API key (e.g., 'sf_', 'sk_')
 * @param service - Optional service name to include in the key
 * @param length - Length of the random portion (default: 32)
 * @returns A formatted API key string
 */
export function generateApiKey(
  prefix: string = 'sk_',
  service?: string,
  length: number = 32
): string {
  const randomBytes = new Uint8Array(length);
  crypto.getRandomValues(randomBytes);
  const randomString = btoa(String.fromCharCode(...randomBytes))
    .replace(/[+/=]/g, '')
    .slice(0, length);

  if (service) {
    return `${prefix}${service}_${randomString}`;
  }
  return `${prefix}${randomString}`;
}

/**
 * Generate a unique identifier using UUID v4
 * @returns A UUID string
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Encrypt a plaintext value using AES-256-GCM (Web Crypto API)
 * Compatible with Cloudflare Workers and modern browsers
 * 
 * @param key - Base64-encoded encryption key (must be 32 bytes when decoded)
 * @param value - Plaintext value to encrypt
 * @returns Base64-encoded encrypted data with IV and auth tag
 */
export async function encryptSecret(key: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    data
  );

  return btoa(
    JSON.stringify({
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(encrypted)),
    })
  );
}

/**
 * Decrypt an encrypted value using AES-256-GCM (Web Crypto API)
 * Compatible with Cloudflare Workers and modern browsers
 * 
 * @param key - Base64-encoded encryption key (must be 32 bytes when decoded)
 * @param encryptedValue - Base64-encoded encrypted data with IV and auth tag
 * @returns Decrypted plaintext value
 */
export async function decryptSecret(key: string, encryptedValue: string): Promise<string> {
  const encoder = new TextEncoder();
  const { iv, data } = JSON.parse(atob(encryptedValue));

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    cryptoKey,
    new Uint8Array(data)
  );

  return new TextDecoder().decode(decrypted);
}
