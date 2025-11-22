/**
 * CryptoProvider interface for encryption and decryption operations
 */
export interface CryptoProvider {
  /**
   * Encrypt a plaintext value
   * @param plaintext - The plaintext value to encrypt
   * @returns The encrypted value as a base64-encoded string
   */
  encrypt(plaintext: string): Promise<string>;

  /**
   * Decrypt an encrypted value
   * @param encryptedValue - The encrypted value as a base64-encoded string
   * @returns The decrypted plaintext value
   */
  decrypt(encryptedValue: string): Promise<string>;
}

/**
 * Default CryptoProvider implementation using AES-256-GCM
 * Uses environment variable SECRETFORGE_ENCRYPTION_KEY for the encryption key
 */
export class DefaultCryptoProvider implements CryptoProvider {
  private encryptionKey: string;

  constructor(encryptionKey?: string) {
    this.encryptionKey = encryptionKey || process.env.SECRETFORGE_ENCRYPTION_KEY || '';
    
    if (!this.encryptionKey) {
      throw new Error(
        'Encryption key not provided. Set SECRETFORGE_ENCRYPTION_KEY environment variable or pass key to constructor.'
      );
    }

    // Ensure key is 32 bytes for AES-256
    if (Buffer.from(this.encryptionKey, 'base64').length !== 32) {
      throw new Error('Encryption key must be 32 bytes (base64 encoded)');
    }
  }

  async encrypt(plaintext: string): Promise<string> {
    const crypto = await import('crypto');
    
    // Generate random IV (12 bytes for GCM)
    const iv = crypto.randomBytes(12);
    
    // Create cipher
    const keyBuffer = Buffer.from(this.encryptionKey, 'base64');
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
    
    // Encrypt
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    // Get auth tag
    const authTag = cipher.getAuthTag();
    
    // Combine IV, auth tag, and encrypted data
    const result = {
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      data: encrypted,
    };
    
    return Buffer.from(JSON.stringify(result)).toString('base64');
  }

  async decrypt(encryptedValue: string): Promise<string> {
    const crypto = await import('crypto');
    
    // Parse encrypted data
    const parsed = JSON.parse(Buffer.from(encryptedValue, 'base64').toString('utf8'));
    const { iv, authTag, data } = parsed;
    
    // Create decipher
    const keyBuffer = Buffer.from(this.encryptionKey, 'base64');
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      keyBuffer,
      Buffer.from(iv, 'base64')
    );
    
    // Set auth tag
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));
    
    // Decrypt
    let decrypted = decipher.update(data, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}

/**
 * Generate a new encryption key for use with the CryptoProvider
 * @returns A base64-encoded 32-byte encryption key
 */
export async function generateEncryptionKey(): Promise<string> {
  const crypto = await import('crypto');
  return crypto.randomBytes(32).toString('base64');
}
