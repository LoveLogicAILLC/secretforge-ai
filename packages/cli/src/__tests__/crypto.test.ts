import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DefaultCryptoProvider, generateEncryptionKey } from '../crypto/CryptoProvider';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlink } from 'fs/promises';

describe('CryptoProvider', () => {
  let encryptionKey: string;
  let cryptoProvider: DefaultCryptoProvider;

  beforeEach(() => {
    encryptionKey = generateEncryptionKey();
    cryptoProvider = new DefaultCryptoProvider(encryptionKey);
  });

  describe('generateEncryptionKey', () => {
    it('should generate a 32-byte base64 key', () => {
      const key = generateEncryptionKey();
      const buffer = Buffer.from(key, 'base64');
      expect(buffer.length).toBe(32);
    });

    it('should generate unique keys', () => {
      const key1 = generateEncryptionKey();
      const key2 = generateEncryptionKey();
      expect(key1).not.toBe(key2);
    });
  });

  describe('DefaultCryptoProvider', () => {
    it('should throw if no encryption key provided', () => {
      const oldEnv = process.env.SECRETFORGE_ENCRYPTION_KEY;
      delete process.env.SECRETFORGE_ENCRYPTION_KEY;
      expect(() => new DefaultCryptoProvider()).toThrow('Encryption key not provided');
      process.env.SECRETFORGE_ENCRYPTION_KEY = oldEnv;
    });

    it('should throw if encryption key is not 32 bytes', () => {
      const shortKey = Buffer.from('short').toString('base64');
      expect(() => new DefaultCryptoProvider(shortKey)).toThrow('Encryption key must be 32 bytes');
    });

    it('should encrypt and decrypt a string', async () => {
      const plaintext = 'my-secret-value';
      const encrypted = await cryptoProvider.encrypt(plaintext);
      const decrypted = await cryptoProvider.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
      expect(encrypted).not.toBe(plaintext);
    });

    it('should produce different ciphertexts for same plaintext', async () => {
      const plaintext = 'my-secret-value';
      const encrypted1 = await cryptoProvider.encrypt(plaintext);
      const encrypted2 = await cryptoProvider.encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2);
      
      const decrypted1 = await cryptoProvider.decrypt(encrypted1);
      const decrypted2 = await cryptoProvider.decrypt(encrypted2);
      
      expect(decrypted1).toBe(plaintext);
      expect(decrypted2).toBe(plaintext);
    });

    it('should handle special characters', async () => {
      const plaintext = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`"\' äöü 中文';
      const encrypted = await cryptoProvider.encrypt(plaintext);
      const decrypted = await cryptoProvider.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle empty string', async () => {
      const plaintext = '';
      const encrypted = await cryptoProvider.encrypt(plaintext);
      const decrypted = await cryptoProvider.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle long strings', async () => {
      const plaintext = 'x'.repeat(10000);
      const encrypted = await cryptoProvider.encrypt(plaintext);
      const decrypted = await cryptoProvider.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should fail to decrypt with wrong key', async () => {
      const plaintext = 'my-secret-value';
      const encrypted = await cryptoProvider.encrypt(plaintext);

      const wrongKey = generateEncryptionKey();
      const wrongProvider = new DefaultCryptoProvider(wrongKey);

      await expect(wrongProvider.decrypt(encrypted)).rejects.toThrow();
    });

    it('should fail to decrypt corrupted data', async () => {
      const plaintext = 'my-secret-value';
      const encrypted = await cryptoProvider.encrypt(plaintext);
      
      // Corrupt the encrypted data
      const corrupted = encrypted.slice(0, -5) + 'xxxxx';

      await expect(cryptoProvider.decrypt(corrupted)).rejects.toThrow();
    });
  });
});
