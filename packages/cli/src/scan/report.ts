import chalk from 'chalk';
import type { SecretMatch, SecretPattern, Severity } from '@secretforge/shared/scanner';

/** Findings with the raw secret removed — the only shape that ever leaves the process. */
export type SafeFinding = Omit<SecretMatch, 'value'>;

export function redact(m: SecretMatch): SafeFinding {
  const { value: _value, ...safe } = m;
  return safe;
}

const SEV_COLOR: Record<Severity, (s: string) => string> = {
  critical: (s) => chalk.bgRed.white.bold(s),
  high: (s) => chalk.red.bold(s),
  medium: (s) => chalk.yellow(s),
  low: (s) => chalk.gray(s),
};

export function renderPretty(
  fresh: SecretMatch[],
  accepted: number,
  meta: { mode: string; scanned: string; failOn: Severity; failing: number }
): string {
  const out: string[] = [];
  out.push(chalk.bold(`\n🔍 SecretForge scan — ${meta.mode} (${meta.scanned})\n`));

  if (fresh.length === 0) {
    out.push(chalk.green('✅ No new secrets found.'));
  } else {
    const byFile = new Map<string, SecretMatch[]>();
    for (const m of fresh) {
      const key = m.location.file;
      byFile.set(key, [...(byFile.get(key) ?? []), m]);
    }
    for (const [file, list] of byFile) {
      out.push(chalk.bold.underline(file));
      for (const m of list) {
        const where = `${m.location.line}:${m.location.column}`;
        const commit = m.location.commit ? chalk.gray(` @${m.location.commit.slice(0, 8)}`) : '';
        out.push(
          `  ${chalk.gray(where.padEnd(8))} ${SEV_COLOR[m.severity](` ${m.severity.toUpperCase()} `)} ${m.type}${commit}`
        );
        out.push(`  ${' '.repeat(8)} ${chalk.gray(m.maskedValue)}  ${chalk.gray(`[${m.ruleId}]`)}`);
        out.push(`  ${' '.repeat(8)} ${chalk.cyan('→ ' + m.recommendation)}`);
      }
      out.push('');
    }
  }

  if (accepted > 0) out.push(chalk.gray(`(${accepted} finding(s) suppressed by baseline)`));
  if (meta.failing > 0) {
    out.push(
      chalk.red.bold(`\n✖ ${meta.failing} finding(s) at or above "${meta.failOn}".`) +
        chalk.gray(
          '\n  False positive? Add an inline `secretforge:allow` comment, or accept it with `sf scan --update-baseline`.'
        )
    );
  }
  return out.join('\n');
}

export function renderJson(fresh: SecretMatch[], accepted: SecretMatch[]): string {
  return JSON.stringify(
    {
      tool: 'secretforge',
      findings: fresh.map(redact),
      suppressed: accepted.map((m) => ({ fingerprint: m.fingerprint, ruleId: m.ruleId, file: m.location.file })),
    },
    null,
    2
  );
}

const SARIF_LEVEL: Record<Severity, 'error' | 'warning' | 'note'> = {
  critical: 'error',
  high: 'error',
  medium: 'warning',
  low: 'note',
};
const SECURITY_SEVERITY: Record<Severity, string> = { critical: '9.5', high: '8.0', medium: '5.5', low: '3.0' };

/** SARIF 2.1.0 — upload with github/codeql-action/upload-sarif to get Code Scanning alerts. */
export function renderSarif(fresh: SecretMatch[], rules: readonly SecretPattern[], version: string): string {
  const used = new Set(fresh.map((m) => m.ruleId));
  const ruleList = rules.filter((r) => used.has(r.id));
  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'SecretForge',
            version,
            informationUri: 'https://github.com/LoveLogicAILLC/secretforge-ai',
            rules: ruleList.map((r) => ({
              id: r.id,
              name: r.name.replace(/[^A-Za-z0-9]+/g, ''),
              shortDescription: { text: r.name },
              help: { text: r.recommendation },
              defaultConfiguration: { level: SARIF_LEVEL[r.severity] },
              properties: {
                tags: ['security', 'secret'],
                'security-severity': SECURITY_SEVERITY[r.severity],
              },
            })),
          },
        },
        results: fresh.map((m) => ({
          ruleId: m.ruleId,
          ruleIndex: ruleList.findIndex((r) => r.id === m.ruleId),
          level: SARIF_LEVEL[m.severity],
          message: { text: `${m.type} (${m.maskedValue}). ${m.recommendation}` },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: m.location.file },
                region: { startLine: m.location.line, startColumn: m.location.column },
              },
            },
          ],
          partialFingerprints: { secretforge: m.fingerprint },
          properties: {
            confidence: m.confidence,
            ...(m.location.commit ? { commit: m.location.commit } : {}),
          },
        })),
      },
    ],
  };
  return JSON.stringify(sarif, null, 2);
}
