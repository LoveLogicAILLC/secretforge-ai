import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';

/**
 * CryptoProvider interface for encryption and decryption operations.
 *
 * `aad` (additional authenticated data) binds a ciphertext to its context
 * (e.g. project/environment/name). A ciphertext copied onto a different
 * record will fail to decrypt instead of silently yielding another secret.
 */
export interface CryptoProvider {
  encrypt(plaintext: string, aad?: string): Promise<string>;
  decrypt(encryptedValue: string, aad?: string): Promise<string>;
}

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const V2_PREFIX = 'sf2.';
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Strictly decode a base64 AES-256 key. Node's base64 decoder silently skips
 * invalid characters, so a typo'd key could otherwise decode to 32 bytes of
 * the wrong material.
 */
export function parseEncryptionKey(encoded: string): Buffer {
  const trimmed = encoded.trim();
  if (!BASE64_RE.test(trimmed)) {
    throw new Error('Encryption key must be base64 encoded');
  }
  const key = Buffer.from(trimmed, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error('Encryption key must be 32 bytes (base64 encoded)');
  }
  return key;
}

/**
 * Resolve the master key: explicit value → SECRETFORGE_ENCRYPTION_KEY → key file.
 * Key files must not be readable by group/other.
 */
export function resolveEncryptionKey(explicit?: string, keyPath?: string): string {
  if (explicit) return explicit;
  if (process.env.SECRETFORGE_ENCRYPTION_KEY) return process.env.SECRETFORGE_ENCRYPTION_KEY;
  if (keyPath) {
    const st = statSync(keyPath);
    if (process.platform !== 'win32' && (st.mode & 0o077) !== 0) {
      throw new Error(
        `Refusing to use key file ${keyPath}: permissions are too open. Run: chmod 600 "${keyPath}"`
      );
    }
    return readFileSync(keyPath, 'utf8').trim();
  }
  return '';
}

/**
 * AES-256-GCM provider.
 *
 * Format v2: `sf2.<base64(iv|tag|ciphertext)>`, bound to optional AAD.
 * Legacy v1 (base64 JSON {iv, authTag, data}, no AAD) is still decrypted so
 * existing vaults keep working; all new writes use v2.
 */
export class DefaultCryptoProvider implements CryptoProvider {
  private readonly key: Buffer;

  constructor(encryptionKey?: string, keyPath?: string) {
    const resolved = resolveEncryptionKey(encryptionKey, keyPath);
    if (!resolved) {
      throw new Error(
        'Encryption key not provided. Set SECRETFORGE_ENCRYPTION_KEY, configure encryptionKeyPath, or pass key to constructor.'
      );
    }
    this.key = parseEncryptionKey(resolved);
  }

  async encrypt(plaintext: string, aad?: string): Promise<string> {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv, { authTagLength: TAG_BYTES });
    if (aad !== undefined) cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return V2_PREFIX + Buffer.concat([iv, tag, ct]).toString('base64');
  }

  async decrypt(encryptedValue: string, aad?: string): Promise<string> {
    if (encryptedValue.startsWith(V2_PREFIX)) {
      const raw = Buffer.from(encryptedValue.slice(V2_PREFIX.length), 'base64');
      if (raw.length < IV_BYTES + TAG_BYTES) throw new Error('Ciphertext is truncated');
      const iv = raw.subarray(0, IV_BYTES);
      const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
      const ct = raw.subarray(IV_BYTES + TAG_BYTES);
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv, { authTagLength: TAG_BYTES });
      if (aad !== undefined) decipher.setAAD(Buffer.from(aad, 'utf8'));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    }
    return this.decryptLegacy(encryptedValue);
  }

  private decryptLegacy(encryptedValue: string): string {
    const parsed = JSON.parse(Buffer.from(encryptedValue, 'base64').toString('utf8'));
    const { iv, authTag, data } = parsed;
    const tag = Buffer.from(authTag, 'base64');
    // Without an explicit tag length, GCM accepts truncated tags (down to 4 bytes),
    // which makes forgery far cheaper. Pin it to the full 16 bytes.
    if (tag.length !== TAG_BYTES) throw new Error('Invalid authentication tag length');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'), {
      authTagLength: TAG_BYTES,
    });
    decipher.setAuthTag(tag);
    return decipher.update(data, 'base64', 'utf8') + decipher.final('utf8');
  }

  /** True if the value is stored in the legacy (unbound) format. */
  static isLegacy(encryptedValue: string): boolean {
    return !encryptedValue.startsWith(V2_PREFIX);
  }
}

/**
 * Generate a new encryption key for use with the CryptoProvider
 * @returns A base64-encoded 32-byte encryption key
 */
export async function generateEncryptionKey(): Promise<string> {
  return randomBytes(KEY_BYTES).toString('base64');
}
