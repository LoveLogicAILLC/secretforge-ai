import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { hashPassword, verifyPassword, PBKDF2_ITERATIONS } from '../security/passwords';
import { encryptSecret, decryptSecret, secretAAD, importMasterKey } from '../security/envelope';
import { timingSafeEqual } from '../security/timingSafe';
import { StripeService } from '../services/stripe';
import { auth, createJWT } from '../middleware/auth';
import { createUserSchema } from '../schemas/validation';

const MASTER_KEY = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const JWT_SECRET = 'test-jwt-secret-that-is-long-enough-123456';

async function legacySha256(pw: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
  return btoa(String.fromCharCode(...new Uint8Array(d)));
}

describe('password hashing', () => {
  it('produces salted PBKDF2 hashes that differ per user', async () => {
    const a = await hashPassword('Correct-Horse-9');
    const b = await hashPassword('Correct-Horse-9');
    expect(a).toMatch(new RegExp(`^pbkdf2_sha256\\$${PBKDF2_ITERATIONS}\\$`));
    expect(a).not.toBe(b);
    expect(await verifyPassword('Correct-Horse-9', a)).toEqual({ valid: true, needsRehash: false });
    expect((await verifyPassword('wrong', a)).valid).toBe(false);
  });

  it('accepts legacy SHA-256 hashes once and flags them for upgrade', async () => {
    const legacy = await legacySha256('OldPassw0rd');
    expect(await verifyPassword('OldPassw0rd', legacy)).toEqual({ valid: true, needsRehash: true });
    expect((await verifyPassword('nope', legacy)).valid).toBe(false);
  });

  it('rejects malformed stored hashes', async () => {
    expect((await verifyPassword('x', 'pbkdf2_sha256$abc$$')).valid).toBe(false);
  });
});

describe('signup schema', () => {
  it('drops a client-supplied tier so nobody can self-assign enterprise', () => {
    const parsed = createUserSchema.parse({
      email: 'a@b.co',
      password: 'Abcdefg1',
      tier: 'enterprise',
    });
    expect(parsed).not.toHaveProperty('tier');
  });
});

describe('secret envelope', () => {
  it('round-trips with a real base64 32-byte key', async () => {
    const ct = await encryptSecret(MASTER_KEY, 'sk_live_real', secretAAD('s1', 'u1'));
    expect(ct.startsWith('v2.')).toBe(true);
    expect(await decryptSecret(MASTER_KEY, ct, secretAAD('s1', 'u1'))).toBe('sk_live_real');
  });

  it('refuses a ciphertext moved to another secret or user', async () => {
    const ct = await encryptSecret(MASTER_KEY, 'victim', secretAAD('s1', 'victim-user'));
    await expect(decryptSecret(MASTER_KEY, ct, secretAAD('s1', 'attacker'))).rejects.toThrow();
    await expect(decryptSecret(MASTER_KEY, ct, secretAAD('s2', 'victim-user'))).rejects.toThrow();
  });

  it('rejects keys that are not exactly 32 bytes of base64', async () => {
    await expect(importMasterKey('a'.repeat(32), ['encrypt'])).rejects.toThrow('32 bytes');
    await expect(importMasterKey('not base64!!', ['encrypt'])).rejects.toThrow();
  });
});

describe('stripe webhook verification', () => {
  const secret = 'whsec_test_123';
  const svc = new StripeService({ apiKey: 'sk_test_x', webhookSecret: secret } as any);

  async function sign(payload: string, ts: number, key = secret) {
    const k = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(key),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`${ts}.${payload}`));
    return Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  it('accepts a correctly signed event (this always threw before)', async () => {
    const payload = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.updated' });
    const ts = Math.floor(Date.now() / 1000);
    const header = `t=${ts},v1=${await sign(payload, ts)}`;
    await expect(svc.verifyWebhook(payload, header)).resolves.toMatchObject({ id: 'evt_1' });
  });

  it('accepts when any of several v1 signatures matches (secret rollover)', async () => {
    const payload = '{"id":"evt_2"}';
    const ts = Math.floor(Date.now() / 1000);
    const header = `t=${ts},v1=${await sign(payload, ts, 'whsec_old')},v1=${await sign(payload, ts)}`;
    await expect(svc.verifyWebhook(payload, header)).resolves.toMatchObject({ id: 'evt_2' });
  });

  it('rejects forged, stale and future-dated events', async () => {
    const payload = '{"id":"evt_3"}';
    const now = Math.floor(Date.now() / 1000);
    await expect(
      svc.verifyWebhook(payload, `t=${now},v1=${await sign(payload, now, 'whsec_attacker')}`)
    ).rejects.toThrow('Invalid signature');
    await expect(
      svc.verifyWebhook(payload, `t=${now - 3600},v1=${await sign(payload, now - 3600)}`)
    ).rejects.toThrow('tolerance');
    await expect(
      svc.verifyWebhook(payload, `t=${now + 3600},v1=${await sign(payload, now + 3600)}`)
    ).rejects.toThrow('tolerance');
  });
});

describe('auth middleware', () => {
  function app(handler: () => void) {
    const a = new Hono<any>();
    a.get('/x', auth as any, (c) => {
      handler();
      return c.json({ ok: true });
    });
    return a;
  }
  const env = { JWT_SECRET, DATABASE: {} as any, API_KEY_SALT: '' };

  function b64url(obj: unknown) {
    return btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }
  async function signRaw(header: object, payload: object) {
    const data = `${b64url(header)}.${b64url(payload)}`;
    const k = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(data)));
    return `${data}.${btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')}`;
  }

  it('accepts a valid token', async () => {
    const token = await createJWT({ userId: 'u1', email: 'a@b.co', tier: 'free' }, JWT_SECRET);
    const res = await app(() => {}).request('/x', { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(200);
  });

  it('rejects correctly signed tokens that never expire', async () => {
    const token = await signRaw({ alg: 'HS256', typ: 'JWT' }, { sub: 'u1', tier: 'enterprise' });
    const res = await app(() => {}).request('/x', { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(401);
  });

  it('does not turn handler errors into 401s or run the handler twice', async () => {
    let calls = 0;
    const a = new Hono<any>();
    a.onError((err, c) => c.json({ error: String(err) }, 500));
    a.get('/boom', auth as any, () => {
      calls++;
      throw new Error('handler failed');
    });
    const token = await createJWT({ userId: 'u1', email: 'a@b.co', tier: 'free' }, JWT_SECRET);
    const res = await a.request(
      '/boom',
      { headers: { Authorization: `Bearer ${token}`, 'X-API-Key': 'sf_whatever' } },
      env
    );
    expect(res.status).toBe(500);
    expect(calls).toBe(1);
  });
});

describe('timingSafeEqual', () => {
  it('compares correctly', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });
});
