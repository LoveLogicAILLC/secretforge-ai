import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret, generateApiKey, generateId } from '../crypto';

describe('Crypto Utilities', () => {
  describe('encryptSecret and decryptSecret', () => {
    const testKey = 'test-encryption-key-32-bytes';
    const testSecret = 'sk_test_secret_value_12345';

    it('should encrypt and decrypt a secret', async () => {
      const encrypted = await encryptSecret(testKey, testSecret);
      expect(encrypted).toBeTruthy();
      expect(encrypted).not.toBe(testSecret);

      const decrypted = await decryptSecret(testKey, encrypted);
      expect(decrypted).toBe(testSecret);
    });

    it('should produce different ciphertext for same plaintext', async () => {
      const encrypted1 = await encryptSecret(testKey, testSecret);
      const encrypted2 = await encryptSecret(testKey, testSecret);

      // Different IVs should produce different ciphertexts
      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to same value
      const decrypted1 = await decryptSecret(testKey, encrypted1);
      const decrypted2 = await decryptSecret(testKey, encrypted2);
      expect(decrypted1).toBe(testSecret);
      expect(decrypted2).toBe(testSecret);
    });

    it('should fail to decrypt with wrong key', async () => {
      const encrypted = await encryptSecret(testKey, testSecret);
      const wrongKey = 'wrong-encryption-key-32-bytes';

      await expect(async () => {
        await decryptSecret(wrongKey, encrypted);
      }).rejects.toThrow();
    });

    it('should handle empty strings', async () => {
      const encrypted = await encryptSecret(testKey, '');
      const decrypted = await decryptSecret(testKey, encrypted);
      expect(decrypted).toBe('');
    });

    it('should handle unicode characters', async () => {
      const unicodeSecret = '🔐 Secret with émojis and spëcial çhars';
      const encrypted = await encryptSecret(testKey, unicodeSecret);
      const decrypted = await decryptSecret(testKey, encrypted);
      expect(decrypted).toBe(unicodeSecret);
    });
  });

  describe('generateApiKey', () => {
    it('should generate API key with default prefix', () => {
      const key = generateApiKey();
      expect(key).toMatch(/^sk_[A-Za-z0-9]+$/);
      expect(key.length).toBeGreaterThan(10);
    });

    it('should generate API key with custom prefix', () => {
      const key = generateApiKey('sf_');
      expect(key).toMatch(/^sf_[A-Za-z0-9]+$/);
    });

    it('should generate API key with service name', () => {
      const key = generateApiKey('sk_', 'stripe');
      expect(key).toMatch(/^sk_stripe_[A-Za-z0-9]+$/);
    });

    it('should generate API key with custom length', () => {
      const key = generateApiKey('sk_', undefined, 16);
      // Length should be prefix + random string
      expect(key.length).toBeGreaterThanOrEqual(18); // sk_ + 16 chars
    });

    it('should generate different keys on each call', () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();
      expect(key1).not.toBe(key2);
    });
  });

  describe('generateId', () => {
    it('should generate a valid UUID', () => {
      const id = generateId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('should generate different IDs on each call', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });
  });
});
