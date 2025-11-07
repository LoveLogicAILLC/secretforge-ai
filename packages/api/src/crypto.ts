/**
 * SecretForge Encryption Layer
 *
 * Implements AES-GCM 256-bit encryption with PBKDF2 key derivation
 * and versioning support for seamless key rotation.
 */

export interface EncryptedPayload {
  version: number;
  salt: number[];
  iv: number[];
  data: number[];
}

const CURRENT_VERSION = 1;
const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 256; // bits
const SALT_LENGTH = 16; // bytes
const IV_LENGTH = 12; // bytes for AES-GCM

/**
 * Derives a cryptographic key from a passphrase using PBKDF2
 */
async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts a secret value with versioning and salt
 */
export async function encryptSecret(
  masterKey: string,
  value: string,
  version: number = CURRENT_VERSION
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);

  // Generate random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Derive encryption key from master key + salt
  const cryptoKey = await deriveKey(masterKey, salt);

  // Encrypt the data
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    data
  );

  // Create payload with version, salt, IV, and encrypted data
  const payload: EncryptedPayload = {
    version,
    salt: Array.from(salt),
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(encrypted)),
  };

  // Base64 encode the entire payload
  return btoa(JSON.stringify(payload));
}

/**
 * Decrypts a secret value with version detection
 */
export async function decryptSecret(
  masterKey: string,
  encryptedValue: string
): Promise<string> {
  const encoder = new TextEncoder();

  // Parse the payload
  const payload: EncryptedPayload = JSON.parse(atob(encryptedValue));

  // Handle different versions
  switch (payload.version) {
    case 1:
      return decryptV1(masterKey, payload);
    default:
      throw new Error(`Unsupported encryption version: ${payload.version}`);
  }
}

/**
 * Decrypts version 1 encrypted secrets
 */
async function decryptV1(
  masterKey: string,
  payload: EncryptedPayload
): Promise<string> {
  const salt = new Uint8Array(payload.salt);
  const iv = new Uint8Array(payload.iv);
  const data = new Uint8Array(payload.data);

  // Derive the decryption key
  const cryptoKey = await deriveKey(masterKey, salt);

  // Decrypt the data
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    data
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Validates encryption key strength
 */
export function validateMasterKey(key: string): { valid: boolean; reason?: string } {
  if (key.length < 32) {
    return { valid: false, reason: "Master key must be at least 32 characters" };
  }

  // Check for sufficient entropy (basic check)
  const uniqueChars = new Set(key.split("")).size;
  if (uniqueChars < 16) {
    return { valid: false, reason: "Master key has insufficient entropy" };
  }

  return { valid: true };
}

/**
 * Generates a secure random master key
 */
export function generateMasterKey(length: number = 64): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array)).replace(/[+/=]/g, "").slice(0, length);
}

/**
 * Re-encrypts a secret with a new master key (for key rotation)
 */
export async function reencryptSecret(
  oldKey: string,
  newKey: string,
  encryptedValue: string
): Promise<string> {
  // Decrypt with old key
  const plaintext = await decryptSecret(oldKey, encryptedValue);

  // Encrypt with new key
  return encryptSecret(newKey, plaintext, CURRENT_VERSION);
}

/**
 * Tests encryption/decryption roundtrip
 */
export async function testEncryption(masterKey: string): Promise<boolean> {
  // Validate key first
  const validation = validateMasterKey(masterKey);
  if (!validation.valid) {
    return false;
  }

  const testData = "test-secret-value-" + Date.now();

  try {
    const encrypted = await encryptSecret(masterKey, testData);
    const decrypted = await decryptSecret(masterKey, encrypted);
    return decrypted === testData;
  } catch (error) {
    console.error("Encryption test failed:", error);
    return false;
  }
}
