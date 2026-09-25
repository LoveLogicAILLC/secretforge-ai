import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanCommand } from '../commands/scan';
import { installHook, uninstallHook, preCommitPath } from '../commands/hook';

// Built at runtime so no credential-shaped literal lives in the repo.
const FAKE_STRIPE = 'sk_' + 'live_' + 'Zx9Qw3Er7Ty1Ui5Op2As6Df4Gh8Jk0Lm';
const FAKE_GH = 'gh' + 'p_' + 'aB3dE5gH7jK9mN1pQ3sT5vW7yZ9bC1dF3gH5';

let dir: string;
const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] }).toString();

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sf-scan-'));
  git('init', '-q');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 'T');
  git('config', 'commit.gpgsign', 'false');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

describe('sf scan', () => {
  it('finds secrets in the working tree and fails at the threshold', async () => {
    writeFileSync(join(dir, 'pay.js'), `const s = require('stripe')('${FAKE_STRIPE}');\n`);
    const r = await scanCommand({ path: dir, format: 'json' });
    expect(r.exitCode).toBe(1);
    expect(r.fresh.map((m) => m.ruleId)).toEqual(['stripe-live-secret']);
  });

  it('never prints the raw secret in any format', async () => {
    writeFileSync(join(dir, 'pay.js'), `k = "${FAKE_STRIPE}"\n`);
    const printed: string[] = [];
    vi.mocked(console.log).mockImplementation((s: string) => void printed.push(String(s)));
    for (const format of ['pretty', 'json', 'sarif'] as const) {
      await scanCommand({ path: dir, format });
    }
    expect(printed.join('\n')).not.toContain(FAKE_STRIPE);
    expect(printed.join('\n')).not.toContain(FAKE_STRIPE.slice(8));
  });

  it('emits valid SARIF 2.1.0 with rule metadata', async () => {
    writeFileSync(join(dir, 'a.env'), `GH_TOKEN=${FAKE_GH}\n`);
    let out = '';
    vi.mocked(console.log).mockImplementation((s: string) => void (out = String(s)));
    await scanCommand({ path: dir, format: 'sarif' });
    const sarif = JSON.parse(out);
    expect(sarif.version).toBe('2.1.0');
    const run = sarif.runs[0];
    expect(run.tool.driver.rules[0].id).toBe('github-token');
    expect(run.results[0]).toMatchObject({
      ruleId: 'github-token',
      level: 'error',
      locations: [{ physicalLocation: { artifactLocation: { uri: 'a.env' }, region: { startLine: 1 } } }],
    });
    expect(run.results[0].partialFingerprints.secretforge).toMatch(/^github-token:/);
  });

  it('respects .gitignore in a repo', async () => {
    writeFileSync(join(dir, '.gitignore'), 'ignored.txt\n');
    writeFileSync(join(dir, 'ignored.txt'), `k = "${FAKE_STRIPE}"\n`);
    const r = await scanCommand({ path: dir, format: 'json' });
    expect(r.fresh).toHaveLength(0);
  });

  it('--staged only looks at what is about to be committed', async () => {
    writeFileSync(join(dir, 'old.js'), `k = "${FAKE_GH}"\n`);
    git('add', 'old.js');
    git('commit', '-qm', 'old', '--no-verify');
    writeFileSync(join(dir, 'new.js'), `const a = 1;\nconst k = "${FAKE_STRIPE}";\n`);
    git('add', 'new.js');
    const r = await scanCommand({ path: dir, staged: true, format: 'json' });
    expect(r.fresh).toHaveLength(1);
    expect(r.fresh[0].location).toMatchObject({ file: 'new.js', line: 2 });
  });

  it('--history finds secrets that were later deleted, attributed to the commit', async () => {
    writeFileSync(join(dir, 'cfg.js'), `k = "${FAKE_STRIPE}"\n`);
    git('add', '.');
    git('commit', '-qm', 'oops', '--no-verify');
    const leakCommit = git('rev-parse', 'HEAD').trim();
    writeFileSync(join(dir, 'cfg.js'), 'k = process.env.STRIPE_KEY\n');
    git('commit', '-qam', 'fix', '--no-verify');

    expect((await scanCommand({ path: dir, format: 'json' })).fresh).toHaveLength(0);
    const hist = await scanCommand({ path: dir, history: true, format: 'json' });
    expect(hist.fresh).toHaveLength(1);
    expect(hist.fresh[0].location.commit).toBe(leakCommit);
  });

  it('baseline suppresses accepted findings but still catches new ones', async () => {
    writeFileSync(join(dir, 'fixture.js'), `k = "${FAKE_STRIPE}"\n`);
    await scanCommand({ path: dir, updateBaseline: true });
    const baseline = readFileSync(join(dir, '.secretforge-baseline.json'), 'utf8');
    expect(baseline).not.toContain(FAKE_STRIPE); // fingerprints only

    const again = await scanCommand({ path: dir, format: 'json' });
    expect(again.exitCode).toBe(0);
    expect(again.accepted).toHaveLength(1);

    writeFileSync(join(dir, 'new.js'), `t = "${FAKE_GH}"\n`);
    const withNew = await scanCommand({ path: dir, format: 'json' });
    expect(withNew.exitCode).toBe(1);
    expect(withNew.fresh.map((m) => m.ruleId)).toEqual(['github-token']);
  });

  it('--fail-on controls the exit code', async () => {
    writeFileSync(join(dir, 't.js'), `k = "${'sk_' + 'test_' + 'Zx9Qw3Er7Ty1Ui5Op2As6Df4'}"\n`); // medium
    expect((await scanCommand({ path: dir, format: 'json', failOn: 'high' })).exitCode).toBe(0);
    expect((await scanCommand({ path: dir, format: 'json', failOn: 'medium' })).exitCode).toBe(1);
  });
});

describe('sf hook', () => {
  it('installs an executable hook and preserves an existing one', () => {
    const path = preCommitPath(dir);
    writeFileSync(path, '#!/bin/sh\necho existing-lint\n', { mode: 0o755 });
    const r = installHook(dir);
    expect(r.action).toBe('appended to existing hook');
    const content = readFileSync(path, 'utf8');
    expect(content).toContain('echo existing-lint');
    expect(content).toContain('sf scan --staged');
    if (process.platform !== 'win32') expect(statSync(path).mode & 0o111).not.toBe(0);

    // Idempotent
    installHook(dir);
    expect(readFileSync(path, 'utf8').match(/>>> secretforge >>>/g)).toHaveLength(1);

    expect(uninstallHook(dir).removed).toBe(true);
    const after = readFileSync(path, 'utf8');
    expect(after).toContain('echo existing-lint');
    expect(after).not.toContain('secretforge');
  });

  it('honours core.hooksPath (husky)', () => {
    git('config', 'core.hooksPath', '.husky');
    const r = installHook(dir);
    expect(r.path).toBe(join(dir, '.husky', 'pre-commit'));
    expect(existsSync(r.path)).toBe(true);
  });
});
