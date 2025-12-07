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
  
  // Convert to base64 safely without spread operator (avoid stack overflow)
  let binary = '';
  for (let i = 0; i < randomBytes.length; i++) {
    binary += String.fromCharCode(randomBytes[i]);
  }
  const randomString = btoa(binary)
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
 * @param key - Encryption key (will be padded/truncated to 32 bytes)
 * @param value - Plaintext value to encrypt
 * @returns Base64-encoded encrypted data with IV and auth tag
 * 
 * Note: This function pads the key with zeros to ensure 32-byte length.
 * In production, use a properly derived 32-byte key from a KDF like PBKDF2.
 */
export async function encryptSecret(key: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);

  // Ensure key is exactly 32 bytes for AES-256
  // NOTE: This simple padding is for compatibility with existing data.
  // For new implementations, consider using a KDF (PBKDF2, HKDF) for key derivation.
  const keyData = encoder.encode(key.padEnd(32, '0').slice(0, 32));
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
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
 * @param key - Encryption key (will be padded/truncated to 32 bytes)
 * @param encryptedValue - Base64-encoded encrypted data with IV and auth tag
 * @returns Decrypted plaintext value
 * 
 * Note: This function pads the key with zeros to ensure 32-byte length.
 * Must match the key derivation method used in encryptSecret().
 */
export async function decryptSecret(key: string, encryptedValue: string): Promise<string> {
  const encoder = new TextEncoder();
  const { iv, data } = JSON.parse(atob(encryptedValue));

  // Ensure key is exactly 32 bytes for AES-256
  // NOTE: This simple padding must match encryptSecret() for compatibility.
  const keyData = encoder.encode(key.padEnd(32, '0').slice(0, 32));

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
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
