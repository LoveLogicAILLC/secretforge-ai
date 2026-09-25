import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createCipheriv, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DefaultCryptoProvider,
  generateEncryptionKey,
  parseEncryptionKey,
} from '../crypto/CryptoProvider';
import { SQLiteSecretStorage } from '../storage/SecretStorage';
import {
  parseDotenv,
  serializeEnvLine,
  serializeEnvValue,
  serializeYaml,
  validateSecretName,
} from '../format/dotenv';
import { assertProjectName } from '../cli/ConfigManager';

const HOSTILE_VALUES = [
  'plain',
  'with space',
  '$(touch PWNED_SUBSHELL)',
  '`touch PWNED_BACKTICK`',
  '${HOME}',
  "it's got a quote",
  'mixed \'single\' and "double" $(touch PWNED_MIXED)',
  'multi\nline\nvalue $(touch PWNED_NL)',
  'trailing backslash \\',
  '#not-a-comment',
  '',
  'unicode ✓ 中文',
];

describe('CryptoProvider hardening', () => {
  let key: string;
  let provider: DefaultCryptoProvider;

  beforeEach(async () => {
    key = await generateEncryptionKey();
    provider = new DefaultCryptoProvider(key);
  });

  it('rejects keys with non-base64 characters instead of silently decoding them', () => {
    const corrupted = key.slice(0, 10) + '!!' + key.slice(12);
    expect(() => parseEncryptionKey(corrupted)).toThrow('base64');
  });

  it('binds ciphertext to its AAD context', async () => {
    const ct = await provider.encrypt('prod-db-password', 'ctx:prod');
    await expect(provider.decrypt(ct, 'ctx:prod')).resolves.toBe('prod-db-password');
    await expect(provider.decrypt(ct, 'ctx:dev')).rejects.toThrow();
    await expect(provider.decrypt(ct)).rejects.toThrow();
  });

  it('still decrypts legacy v1 ciphertexts', async () => {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'base64'), iv);
    const data = cipher.update('legacy', 'utf8', 'base64') + cipher.final('base64');
    const legacy = Buffer.from(
      JSON.stringify({ iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64'), data })
    ).toString('base64');
    expect(DefaultCryptoProvider.isLegacy(legacy)).toBe(true);
    await expect(provider.decrypt(legacy)).resolves.toBe('legacy');
  });

  it('rejects legacy ciphertexts with a truncated GCM tag', async () => {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'base64'), iv);
    const data = cipher.update('legacy', 'utf8', 'base64') + cipher.final('base64');
    const shortTag = cipher.getAuthTag().subarray(0, 4).toString('base64');
    const forged = Buffer.from(JSON.stringify({ iv: iv.toString('base64'), authTag: shortTag, data })).toString(
      'base64'
    );
    await expect(provider.decrypt(forged)).rejects.toThrow('authentication tag length');
  });

  it('loads the key from a 0600 key file and refuses a world-readable one', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sf-key-'));
    const old = process.env.SECRETFORGE_ENCRYPTION_KEY;
    delete process.env.SECRETFORGE_ENCRYPTION_KEY;
    try {
      const good = join(dir, 'good.key');
      writeFileSync(good, key + '\n', { mode: 0o600 });
      const fromFile = new DefaultCryptoProvider(undefined, good);
      await expect(fromFile.decrypt(await provider.encrypt('x'))).resolves.toBe('x');

      if (process.platform !== 'win32') {
        const bad = join(dir, 'bad.key');
        writeFileSync(bad, key, { mode: 0o644 });
        expect(() => new DefaultCryptoProvider(undefined, bad)).toThrow('permissions are too open');
      }
    } finally {
      if (old !== undefined) process.env.SECRETFORGE_ENCRYPTION_KEY = old;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('SQLiteSecretStorage hardening', () => {
  let dir: string;
  let storage: SQLiteSecretStorage;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'sf-store-'));
    storage = new SQLiteSecretStorage(
      join(dir, 'nested', 'vault.db'),
      new DefaultCryptoProvider(await generateEncryptionKey())
    );
  });

  afterEach(() => {
    storage.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates the vault file with owner-only permissions', () => {
    if (process.platform === 'win32') return;
    expect(statSync(join(dir, 'nested', 'vault.db')).mode & 0o777).toBe(0o600);
    expect(statSync(join(dir, 'nested')).mode & 0o777).toBe(0o700);
  });

  it('detects a ciphertext swapped between records (prod <-> dev)', async () => {
    const dev = await storage.addSecret({ name: 'DB_PASS', value: 'dev-pw', project: 'p', environment: 'dev' });
    const prod = await storage.addSecret({ name: 'DB_PASS', value: 'prod-pw', project: 'p', environment: 'prod' });
    // Attacker with write access to the DB copies prod's blob onto the dev row.
    const tampered = { ...dev, value_encrypted: prod.value_encrypted };
    await expect(storage.decryptSecret(tampered)).rejects.toThrow();
  });

  it('treats % and _ in tag filters literally', async () => {
    await storage.addSecret({ name: 'A', value: '1', project: 'p', environment: 'dev', tags: ['billing'] });
    await storage.addSecret({ name: 'B', value: '2', project: 'p', environment: 'dev', tags: ['bill_ng'] });
    expect(await storage.listSecrets({ tags: ['%'] })).toHaveLength(0);
    expect((await storage.listSecrets({ tags: ['bill_ng'] })).map((s) => s.name)).toEqual(['B']);
    expect((await storage.listSecrets({ tags: ['billing', 'bill_ng'] })).map((s) => s.name).sort()).toEqual([
      'A',
      'B',
    ]);
  });

  it('keeps the AAD binding across updates', async () => {
    const s = await storage.addSecret({ name: 'K', value: 'v1', project: 'p', environment: 'dev' });
    const updated = await storage.updateSecret(s.id, 'v2');
    await expect(storage.decryptSecret(updated)).resolves.toBe('v2');
  });
});

describe('env serialization', () => {
  it('rejects names that could inject variables or hijack the environment', () => {
    expect(validateSecretName('STRIPE_KEY')).toBe(true);
    expect(validateSecretName('FOO\nNODE_OPTIONS')).not.toBe(true);
    expect(validateSecretName('A=B')).not.toBe(true);
    expect(validateSecretName('1ABC')).not.toBe(true);
    expect(validateSecretName('PATH')).not.toBe(true);
    expect(validateSecretName('ld_preload')).not.toBe(true);
    expect(() => serializeEnvLine('BAD NAME', 'x')).toThrow();
  });

  it('round-trips hostile values through our own parser', () => {
    for (const value of HOSTILE_VALUES) {
      const parsed = parseDotenv(serializeEnvLine('V', value));
      expect(parsed.get('V')).toBe(value);
    }
  });

  it('never runs commands and preserves values when the file is sourced by a real shell', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sf-env-'));
    try {
      const lines = HOSTILE_VALUES.filter((v) => !v.includes('\n')).map((v, i) =>
        serializeEnvLine(`V${i}`, v)
      );
      const envFile = join(dir, '.env');
      writeFileSync(envFile, lines.join('\n') + '\n');
      const script = `set -e; . ./.env; ${HOSTILE_VALUES.filter((v) => !v.includes('\n'))
        .map((_, i) => `printf '%s\\0' "$V${i}"`)
        .join('; ')}`;
      const out = execFileSync('sh', ['-c', script], { cwd: dir }).toString();
      expect(out.split('\0').slice(0, -1)).toEqual(HOSTILE_VALUES.filter((v) => !v.includes('\n')));
      for (const marker of ['PWNED_SUBSHELL', 'PWNED_BACKTICK', 'PWNED_MIXED']) {
        expect(existsSync(join(dir, marker))).toBe(false);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not leave shell-active characters unquoted', () => {
    expect(serializeEnvValue('a$(b)')).toBe("'a$(b)'");
    expect(serializeEnvValue("a'$(b)")).toBe('"a\'\\$(b)"');
  });

  it('emits valid, correctly escaped YAML', () => {
    const yaml = serializeYaml({ K: 'line1\nline2 "q" \\' });
    expect(yaml).toContain('"K": "line1\\nline2 \\"q\\" \\\\"');
  });
});

describe('project names', () => {
  it('blocks path traversal through the project name', () => {
    expect(() => assertProjectName('my-app')).not.toThrow();
    expect(() => assertProjectName('../../.ssh/authorized_keys')).toThrow();
    expect(() => assertProjectName('a/b')).toThrow();
    expect(() => assertProjectName('..')).toThrow();
  });
});
