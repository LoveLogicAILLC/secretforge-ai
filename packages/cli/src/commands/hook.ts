import chalk from 'chalk';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { generatePreCommitHook, type Severity } from '@secretforge/shared/scanner';
import { git, isGitRepo, repoRoot } from '../scan/sources.js';

const BEGIN = '# >>> secretforge >>>';
const END = '# <<< secretforge <<<';

/** Resolve the pre-commit hook path, honouring core.hooksPath (husky, lefthook, …). */
export function preCommitPath(cwd: string): string {
  const root = repoRoot(cwd);
  const p = git(['rev-parse', '--git-path', 'hooks/pre-commit'], root).trim();
  return isAbsolute(p) ? p : join(root, p);
}

function stripBlock(content: string): string {
  const start = content.indexOf(BEGIN);
  const end = content.indexOf(END);
  if (start === -1 || end === -1) return content;
  return (content.slice(0, start) + content.slice(end + END.length)).replace(/\n{3,}/g, '\n\n');
}

export function installHook(cwd: string, failOn: Severity = 'high'): { path: string; action: string } {
  if (!isGitRepo(cwd)) throw new Error('Not a git repository');
  const path = preCommitPath(cwd);
  mkdirSync(dirname(path), { recursive: true });

  const block = generatePreCommitHook({ failOn });
  let content = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const action = content.includes(BEGIN) ? 'updated' : content ? 'appended to existing hook' : 'created';

  // Never clobber an existing hook: replace only our own block.
  content = stripBlock(content).trimEnd();
  if (!content) content = '#!/bin/sh';
  content = `${content}\n\n${block}`;

  writeFileSync(path, content);
  chmodSync(path, 0o755);
  return { path, action };
}

export function uninstallHook(cwd: string): { path: string; removed: boolean } {
  const path = preCommitPath(cwd);
  if (!existsSync(path)) return { path, removed: false };
  const content = readFileSync(path, 'utf8');
  if (!content.includes(BEGIN)) return { path, removed: false };
  writeFileSync(path, stripBlock(content).trimEnd() + '\n');
  return { path, removed: true };
}

export async function hookCommand(action: string, options: { failOn?: Severity }): Promise<void> {
  const cwd = process.cwd();
  if (action === 'install') {
    const r = installHook(cwd, options.failOn ?? 'high');
    console.log(chalk.green(`✅ Pre-commit secret scan ${r.action}: ${r.path}`));
    console.log(chalk.gray('   Every commit now runs `sf scan --staged`.'));
  } else if (action === 'uninstall') {
    const r = uninstallHook(cwd);
    console.log(
      r.removed ? chalk.green(`Removed SecretForge block from ${r.path}`) : chalk.gray('No SecretForge hook found.')
    );
  } else {
    throw new Error('Usage: sf hook <install|uninstall>');
  }
}
