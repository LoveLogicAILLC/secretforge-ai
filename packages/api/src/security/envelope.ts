import { base64ToBytes, bytesToBase64 } from './timingSafe';

/**
 * AES-256-GCM envelope for secrets stored in KV.
 *
 * Fixes: the master key was previously imported as the UTF-8 *text* of the
 * base64 string (44 bytes for a real 32-byte key, which WebCrypto rejects, or
 * a low-entropy ASCII passphrase if someone "made it work" with 32 chars).
 * The key is now base64-decoded and must be exactly 32 bytes, and each
 * ciphertext is bound to its secret id + owner via AAD so KV records cannot be
 * swapped between users/secrets.
 */
const V2 = 'v2';

export async function importMasterKey(
  encoded: string,
  usage: Array<'encrypt' | 'decrypt'>
): Promise<CryptoKey> {
  let raw: Uint8Array;
  try {
    raw = base64ToBytes(encoded.trim());
  } catch {
    throw new Error('ENCRYPTION_KEY must be base64');
  }
  if (raw.length !== 32) {
    throw new Error('ENCRYPTION_KEY must decode to exactly 32 bytes (openssl rand -base64 32)');
  }
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, usage);
}

export function secretAAD(secretId: string, userId: string): string {
  return JSON.stringify(['secretforge/api/v2', secretId, userId]);
}

export async function encryptSecret(masterKey: string, value: string, aad: string): Promise<string> {
  const key = await importMasterKey(masterKey, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(aad), tagLength: 128 },
    key,
    new TextEncoder().encode(value)
  );
  return `${V2}.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ct))}`;
}

export async function decryptSecret(masterKey: string, stored: string, aad: string): Promise<string> {
  const [version, ivB64, ctB64] = stored.split('.');
  if (version !== V2 || !ivB64 || !ctB64) {
    throw new Error('Unsupported ciphertext format');
  }
  const key = await importMasterKey(masterKey, ['decrypt']);
  const pt = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: base64ToBytes(ivB64),
      additionalData: new TextEncoder().encode(aad),
      tagLength: 128,
    },
    key,
    base64ToBytes(ctB64)
  );
  return new TextDecoder().decode(pt);
}
