import { describe, it, expect } from 'vitest';
import {
  SecretDetector,
  fingerprint,
  generatePreCommitHook,
  maskSecret,
} from '../secretDetector';

// Test tokens are assembled at runtime so this file never contains a literal
// credential-shaped string (keeps GitHub push protection and our own scanner quiet).
const rnd = (alphabet: string, n: number, seed = 7) => {
  let s = seed;
  let out = '';
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out += alphabet[s % alphabet.length];
  }
  return out;
};
const AZ09 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const UPPER09 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const HEX = '0123456789abcdef';

const T = {
  aws: 'AK' + 'IA' + rnd(UPPER09, 16),
  openaiProj: 'sk-' + 'proj-' + rnd(AZ09 + '_-', 120),
  anthropic: 'sk-' + 'ant-api03-' + rnd(AZ09 + '_-', 93) + 'AA',
  google: 'AI' + 'za' + rnd(AZ09, 20) + '-_' + rnd(AZ09, 13),
  googleOauth: 'ya' + '29.' + rnd(AZ09 + '_-', 60),
  ghFine: 'github_' + 'pat_' + rnd(AZ09, 22) + '_' + rnd(AZ09, 59),
  ghp: 'gh' + 'p_' + rnd(AZ09, 36),
  stripeLive: 'sk_' + 'live_' + rnd(AZ09, 32),
  stripeRestricted: 'rk_' + 'live_' + rnd(AZ09, 32),
  npm: 'np' + 'm_' + rnd(AZ09, 36),
  slack: 'xo' + 'xp-' + rnd('0123456789', 12) + '-' + rnd('0123456789', 12) + '-' + rnd(AZ09, 24),
  twilio: 'S' + 'K' + rnd(HEX, 32),
};

const d = new SecretDetector();
const ruleIds = (line: string) => d.scanLine(line, 'f.ts', 1).map((m) => m.ruleId);

describe('SecretDetector v2 — coverage of real-world key formats', () => {
  it.each([
    ['aws-access-key-id', `const k = "${T.aws}";`],
    ['openai-api-key', `OPENAI_API_KEY=${T.openaiProj}`],
    ['anthropic-api-key', `ANTHROPIC_API_KEY=${T.anthropic}`],
    ['gcp-api-key', `key: "${T.google}"`],
    ['gcp-oauth-token', `Authorization: Bearer ${T.googleOauth}`],
    ['github-fine-grained-pat', `token = "${T.ghFine}"`],
    ['github-token', `GH_TOKEN=${T.ghp}`],
    ['stripe-live-secret', `stripe(${JSON.stringify(T.stripeLive)})`],
    ['stripe-live-secret', `STRIPE=${T.stripeRestricted}`],
    ['npm-token', `//registry.npmjs.org/:_authToken=${T.npm}`],
    ['slack-token', `SLACK=${T.slack}`],
    ['private-key', '-----BEGIN EC ' + 'PRIVATE KEY-----'],
    ['private-key', `"private_key": "-----BEGIN ${'PRIVATE KEY'}-----\\n${rnd(AZ09, 64)}"`],
    ['connection-string-password', 'DATABASE_URL=postgresql://app:S3cr3t!Pa55w0rd@db.internal:5432/prod'],
    ['connection-string-password', 'mongodb+srv://svc:hunter2hunter2@cluster0.mongodb.net/app'],
  ])('detects %s', (rule, line) => {
    expect(ruleIds(line)).toContain(rule);
  });

  it('detects the v1 blind spots: modern OpenAI, Anthropic with "_", Google keys with "-"', () => {
    // All three were missed by the v1 regexes.
    expect(ruleIds(T.openaiProj)).toEqual(['openai-api-key']);
    expect(ruleIds(T.anthropic)).toEqual(['anthropic-api-key']);
    expect(ruleIds(T.google)).toEqual(['gcp-api-key']);
  });
});

describe('SecretDetector v2 — precision', () => {
  it('reports one finding per secret (specific beats generic)', () => {
    const matches = d.scanLine(`const stripeApiKey = "${T.stripeLive}";`, 'a.ts', 1);
    expect(matches.map((m) => m.ruleId)).toEqual(['stripe-live-secret']);
  });

  it('does not flag hashes/ids that merely contain a prefix', () => {
    expect(ruleIds(`sha=${'a'.repeat(4)}SK${rnd(HEX, 40)}`)).toEqual([]);
    expect(ruleIds(`const id = "xAKIA${rnd(UPPER09, 16)}"`)).toEqual([]);
  });

  it('skips documentation placeholders and templated values', () => {
    expect(ruleIds('aws_access_key_id = AKIAIOSFODNN7EXAMPLE')).toEqual([]);
    expect(ruleIds('DATABASE_URL=postgres://user:${DB_PASSWORD}@localhost/db')).toEqual([]);
    expect(ruleIds('api_key: "your-api-key-goes-here-please"')).toEqual([]);
    expect(ruleIds('password = "xxxxxxxxxxxxxxxxxxxx"')).toEqual([]);
  });

  it('honours inline allow comments', () => {
    expect(ruleIds(`const k = "${T.aws}"; // secretforge:allow test fixture`)).toEqual([]);
    expect(ruleIds(`k = "${T.aws}"  # gitleaks:allow`)).toEqual([]);
  });

  it('requires entropy for generic assignments', () => {
    expect(ruleIds('secret = "aaaaaaaaaaaaaaaaaaaaaaaa"')).toEqual([]);
    expect(ruleIds(`client_secret = "${rnd(AZ09, 32)}"`)).toEqual(['generic-assignment']);
  });

  it('ignores a PEM header that is only mentioned in code or docs', () => {
    expect(ruleIds(`if (pem.startsWith('-----BEGIN RSA ${'PRIVATE KEY'}-----')) {`)).toEqual([]);
  });

  it('skips binary content', () => {
    expect(d.scanFile(`\u0000\u0001${T.aws}`, 'bin.dat')).toEqual([]);
  });
});

describe('SecretDetector v2 — output safety & stability', () => {
  it('masked values never contain more than a 4-char prefix of the secret', () => {
    for (const secret of Object.values(T)) {
      const masked = maskSecret(secret);
      expect(masked).not.toContain(secret.slice(0, 8));
      expect(masked).not.toContain(secret.slice(-4));
    }
  });

  it('fingerprints are stable, file-scoped and do not contain the secret', () => {
    const a = fingerprint('aws-access-key-id', 'a.ts', T.aws);
    expect(a).toBe(fingerprint('aws-access-key-id', 'a.ts', T.aws));
    expect(a).not.toBe(fingerprint('aws-access-key-id', 'b.ts', T.aws));
    expect(a).not.toContain(T.aws.slice(4));
  });

  it('reports correct 1-based line/column', () => {
    const [m] = d.scanFile(`line one\n  token = "${T.ghp}"\n`, 'x.ts');
    expect(m.location).toMatchObject({ file: 'x.ts', line: 2, column: 12 });
  });
});

describe('scanDiff', () => {
  it('scans only added lines with new-file line numbers and commit attribution', () => {
    const diff = [
      'commit 0123456789abcdef0123456789abcdef01234567',
      'Author: dev',
      '',
      'diff --git a/src/app.ts b/src/app.ts',
      '--- a/src/app.ts',
      '+++ b/src/app.ts',
      '@@ -10,0 +11,2 @@',
      '+const ok = 1;',
      `+const key = "${T.aws}";`,
      '@@ -40 +42 @@',
      `-const old = "${T.ghp}";`,
      '+const fine = 2;',
    ].join('\n');
    const matches = d.scanDiff(diff);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      ruleId: 'aws-access-key-id',
      location: { file: 'src/app.ts', line: 12, commit: '0123456789abcdef0123456789abcdef01234567' },
    });
  });
});

describe('pre-commit hook', () => {
  it('never lets npx fetch a package from the registry', () => {
    const hook = generatePreCommitHook();
    expect(hook).not.toMatch(/npx (?!--no)/);
    expect(hook).toContain('sf scan --staged');
  });
});
