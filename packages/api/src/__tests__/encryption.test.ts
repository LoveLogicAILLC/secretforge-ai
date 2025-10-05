import { describe, it, expect } from 'vitest';

// Helper functions to test
async function encryptSecret(key: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key.padEnd(32, '0').slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, data);

  return btoa(
    JSON.stringify({
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(encrypted)),
    })
  );
}

async function decryptSecret(key: string, encryptedValue: string): Promise<string> {
  const encoder = new TextEncoder();
  const { iv, data } = JSON.parse(atob(encryptedValue));

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key.padEnd(32, '0').slice(0, 32)),
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
