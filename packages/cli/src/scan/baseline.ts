import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { SecretMatch } from '@secretforge/shared/scanner';

/**
 * A baseline records findings that have been reviewed and accepted (e.g. test
 * fixtures, or already-rotated keys still present in history) so the scanner
 * only fails on *new* secrets. It stores fingerprints only — never values.
 */
export interface BaselineEntry {
  ruleId: string;
  file: string;
  line: number;
  commit?: string;
  acceptedAt: string;
  note?: string;
}

export interface Baseline {
  version: 1;
  tool: 'secretforge';
  entries: Record<string, BaselineEntry>;
}

export const DEFAULT_BASELINE = '.secretforge-baseline.json';

export function loadBaseline(path: string): Baseline {
  if (!existsSync(path)) return { version: 1, tool: 'secretforge', entries: {} };
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  if (parsed?.tool !== 'secretforge' || typeof parsed.entries !== 'object') {
    throw new Error(`${path} is not a SecretForge baseline file`);
  }
  return parsed as Baseline;
}

export function partitionByBaseline(
  matches: SecretMatch[],
  baseline: Baseline
): { fresh: SecretMatch[]; accepted: SecretMatch[] } {
  const fresh: SecretMatch[] = [];
  const accepted: SecretMatch[] = [];
  for (const m of matches) (baseline.entries[m.fingerprint] ? accepted : fresh).push(m);
  return { fresh, accepted };
}

export function writeBaseline(path: string, matches: SecretMatch[], previous?: Baseline): number {
  const entries: Record<string, BaselineEntry> = { ...(previous?.entries ?? {}) };
  let added = 0;
  const now = new Date().toISOString();
  for (const m of matches) {
    if (entries[m.fingerprint]) continue;
    entries[m.fingerprint] = {
      ruleId: m.ruleId,
      file: m.location.file,
      line: m.location.line,
      ...(m.location.commit ? { commit: m.location.commit } : {}),
      acceptedAt: now,
    };
    added++;
  }
  const sorted = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
  const doc: Baseline = { version: 1, tool: 'secretforge', entries: sorted };
  writeFileSync(path, JSON.stringify(doc, null, 2) + '\n');
  return added;
}
