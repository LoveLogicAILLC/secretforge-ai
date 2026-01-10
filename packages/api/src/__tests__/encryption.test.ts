import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret } from '@secretforge/shared';

describe('Encryption', () => {
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
