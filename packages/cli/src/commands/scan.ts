import chalk from 'chalk';
import { writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { SEVERITY_RANK, SecretDetector, type SecretMatch, type Severity } from '@secretforge/shared/scanner';
import { DEFAULT_BASELINE, loadBaseline, partitionByBaseline, writeBaseline } from '../scan/baseline.js';
import { renderJson, renderPretty, renderSarif } from '../scan/report.js';
import { historyDiff, isGitRepo, repoRoot, stagedDiff, workingTreeFiles } from '../scan/sources.js';

export const CLI_VERSION = '1.1.0';

export interface ScanOptions {
  staged?: boolean;
  history?: boolean;
  since?: string;
  path?: string;
  format?: 'pretty' | 'json' | 'sarif';
  output?: string;
  baseline?: string;
  updateBaseline?: boolean;
  failOn?: Severity | 'none';
  minConfidence?: string | number;
}

export interface ScanOutcome {
  exitCode: number;
  fresh: SecretMatch[];
  accepted: SecretMatch[];
}

const SEVERITIES: Array<Severity | 'none'> = ['critical', 'high', 'medium', 'low', 'none'];

/**
 * `sf scan` — find secrets in the working tree, the staged diff (pre-commit),
 * or the entire git history. Exit code 1 when non-baselined findings at or
 * above --fail-on exist, 2 on usage/runtime errors, 0 otherwise.
 */
export async function scanCommand(options: ScanOptions): Promise<ScanOutcome> {
  const cwd = resolve(options.path ?? process.cwd());
  const format = options.format ?? 'pretty';
  const failOn = options.failOn ?? 'high';
  const minConfidence = Number(options.minConfidence ?? 0.5);

  if (!['pretty', 'json', 'sarif'].includes(format)) throw new Error(`Unknown format "${format}"`);
  if (!SEVERITIES.includes(failOn)) throw new Error(`--fail-on must be one of ${SEVERITIES.join(', ')}`);
  if (options.staged && options.history) throw new Error('Use either --staged or --history, not both');
  if (Number.isNaN(minConfidence) || minConfidence < 0 || minConfidence > 1) {
    throw new Error('--min-confidence must be between 0 and 1');
  }

  const inRepo = isGitRepo(cwd);
  if ((options.staged || options.history) && !inRepo) {
    throw new Error(`${cwd} is not a git repository`);
  }
  const root = inRepo ? repoRoot(cwd) : cwd;
  const detector = new SecretDetector();

  let matches: SecretMatch[];
  let mode: string;
  let scanned: string;

  if (options.staged) {
    mode = 'staged changes';
    const diff = stagedDiff(root);
    matches = detector.scanDiff(diff);
    scanned = `${(diff.match(/^\+\+\+ /gm) ?? []).length} file(s)`;
  } else if (options.history) {
    mode = options.since ? `git history since ${options.since}` : 'full git history';
    const diff = historyDiff(root, options.since);
    const seen = new Set<string>();
    matches = detector.scanDiff(diff).filter((m) => {
      if (seen.has(m.fingerprint)) return false;
      seen.add(m.fingerprint);
      return true;
    });
    scanned = `${(diff.match(/^commit [0-9a-f]{40}$/gm) ?? []).length} commit(s)`;
  } else {
    mode = 'working tree';
    const files = workingTreeFiles(root);
    matches = files.flatMap((f) => detector.scanFile(f.content, f.path));
    scanned = `${files.length} file(s)`;
  }

  matches = matches.filter((m) => m.confidence >= minConfidence);

  const baselinePath = resolveIn(root, options.baseline ?? DEFAULT_BASELINE);
  const baseline = loadBaseline(baselinePath);

  if (options.updateBaseline) {
    const added = writeBaseline(baselinePath, matches, baseline);
    console.error(
      chalk.green(`Baseline updated: ${added} new finding(s) accepted → ${baselinePath}`) +
        chalk.gray('\nReview it: accepted secrets that are real must still be rotated.')
    );
    return { exitCode: 0, fresh: [], accepted: matches };
  }

  const { fresh, accepted } = partitionByBaseline(matches, baseline);
  const failing =
    failOn === 'none' ? 0 : fresh.filter((m) => SEVERITY_RANK[m.severity] >= SEVERITY_RANK[failOn]).length;

  let rendered: string;
  if (format === 'json') rendered = renderJson(fresh, accepted);
  else if (format === 'sarif') rendered = renderSarif(fresh, detector.rules, CLI_VERSION);
  else rendered = renderPretty(fresh, accepted.length, { mode, scanned, failOn: failOn as Severity, failing });

  if (options.output) {
    writeFileSync(resolveIn(process.cwd(), options.output), rendered + '\n');
    console.error(chalk.gray(`Report written to ${options.output}`));
    if (format !== 'pretty') {
      console.error(
        renderPretty(fresh, accepted.length, { mode, scanned, failOn: failOn as Severity, failing })
      );
    }
  } else {
    console.log(rendered);
  }

  return { exitCode: failing > 0 ? 1 : 0, fresh, accepted };
}

function resolveIn(base: string, p: string): string {
  return isAbsolute(p) ? p : join(base, p);
}
