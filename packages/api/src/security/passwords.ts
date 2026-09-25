import { base64ToBytes, bytesToBase64, timingSafeEqual } from './timingSafe';

/**
 * Password hashing with salted PBKDF2-HMAC-SHA256.
 *
 * Previously passwords were stored as a single unsalted SHA-256, which a GPU
 * cracks at billions of guesses per second and which lets identical passwords
 * be spotted across users. 100k iterations is the maximum Cloudflare Workers'
 * WebCrypto allows; stored hashes carry their parameters so the cost can be
 * raised later and old hashes upgraded on login.
 */
export const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const PREFIX = 'pbkdf2_sha256';

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    HASH_BYTES * 8
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `${PREFIX}$${PBKDF2_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

async function legacySha256(password: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return bytesToBase64(new Uint8Array(digest));
}

export interface PasswordCheck {
  valid: boolean;
  /** True when the stored hash should be replaced with a fresh `hashPassword()` result. */
  needsRehash: boolean;
}

export async function verifyPassword(password: string, stored: string): Promise<PasswordCheck> {
  if (stored.startsWith(`${PREFIX}$`)) {
    const [, iterStr, saltB64, hashB64] = stored.split('$');
    const iterations = Number(iterStr);
    if (!Number.isInteger(iterations) || iterations < 1 || !saltB64 || !hashB64) {
      return { valid: false, needsRehash: false };
    }
    const actual = await pbkdf2(password, base64ToBytes(saltB64), iterations);
    const valid = timingSafeEqual(actual, base64ToBytes(hashB64));
    return { valid, needsRehash: valid && iterations < PBKDF2_ITERATIONS };
  }
  // Legacy unsalted SHA-256: accept once, then force an upgrade.
  const valid = timingSafeEqual(await legacySha256(password), stored);
  return { valid, needsRehash: valid };
}
