import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_BUFFER = 512 * 1024 * 1024;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.turbo', 'coverage', '.wrangler']);
const SKIP_FILES = /(?:^|\/)(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock|\.secretforge-baseline\.json)$|\.(?:png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|woff2?|ttf|eot|mp[34]|mov|wasm|map)$/i;

export function git(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    maxBuffer: MAX_BUFFER,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).toString('utf8');
}

export function isGitRepo(cwd: string): boolean {
  try {
    git(['rev-parse', '--is-inside-work-tree'], cwd);
    return true;
  } catch {
    return false;
  }
}

export function repoRoot(cwd: string): string {
  return git(['rev-parse', '--show-toplevel'], cwd).trim();
}

/** Added lines in the index (what the next commit would introduce). */
export function stagedDiff(cwd: string): string {
  return git(
    ['diff', '--cached', '--no-color', '--no-ext-diff', '--unified=0', '--diff-filter=ACMR', '--no-renames'],
    cwd
  );
}

/** Every line ever added on any ref, newest first, with commit headers. */
export function historyDiff(cwd: string, since?: string): string {
  const args = ['log', '-p', '--all', '--no-color', '--no-ext-diff', '--unified=0', '--format=commit %H'];
  if (since) args.push(`--since=${since}`);
  return git(args, cwd);
}

export interface FileEntry {
  path: string; // repo/dir relative, forward slashes
  content: string;
}

function shouldSkip(path: string): boolean {
  return SKIP_FILES.test(path) || path.split('/').some((seg) => SKIP_DIRS.has(seg));
}

function readIfText(abs: string): string | null {
  try {
    const st = statSync(abs);
    if (!st.isFile() || st.size > MAX_FILE_BYTES) return null;
    const buf = readFileSync(abs);
    if (buf.subarray(0, 8000).includes(0)) return null; // binary
    return buf.toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Working-tree files: tracked + untracked-but-not-ignored when in a git repo
 * (so .gitignore is honoured), otherwise a filtered directory walk.
 */
export function workingTreeFiles(root: string): FileEntry[] {
  const out: FileEntry[] = [];
  if (isGitRepo(root)) {
    const list = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], root)
      .split('\0')
      .filter(Boolean);
    for (const rel of list) {
      if (shouldSkip(rel)) continue;
      const content = readIfText(join(root, rel));
      if (content !== null) out.push({ path: rel, content });
    }
    return out;
  }

  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      const rel = relative(root, abs).split('\\').join('/');
      if (shouldSkip(rel)) continue;
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(abs);
      else {
        const content = readIfText(abs);
        if (content !== null) out.push({ path: rel, content });
      }
    }
  };
  walk(root);
  return out;
}
