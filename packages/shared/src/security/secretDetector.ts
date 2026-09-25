/**
 * SecretForge detection engine (v2).
 *
 * Pattern + entropy + context scanner for leaked credentials. Changes vs v1:
 *  - Fixed patterns that could never match real keys: Google API keys (the
 *    `\\-` char class excluded `-`), Google OAuth (`ya29\\.` required a literal
 *    backslash), modern OpenAI `sk-proj-…`/`sk-svcacct-…`, Anthropic
 *    `sk-ant-api03-…` (contain `_`), GitHub fine-grained `github_pat_…`.
 *  - Added AWS STS, Stripe restricted, Slack user/app, npm, PyPI, Hugging Face,
 *    Telegram, Shopify, DigitalOcean, all PEM private-key flavours, and
 *    connection strings for Postgres/MySQL/Mongo/Redis/AMQP with any password.
 *  - Word boundaries so hashes and IDs stop producing false positives.
 *  - Overlapping matches are de-duplicated (a Stripe key is not also reported
 *    as a "Generic API Key").
 *  - Inline allow comments (`secretforge:allow`, `gitleaks:allow`) and known
 *    documentation placeholders are skipped.
 *  - Every finding carries a stable `ruleId` and `fingerprint` so results can
 *    be baselined, and a redacted form that is safe to print.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface SecretMatch {
  ruleId: string;
  type: string;
  /** Raw secret. Never print or transmit this; use `maskedValue`. */
  value: string;
  maskedValue: string;
  location: {
    file: string;
    line: number;
    column: number;
    commit?: string;
  };
  confidence: number; // 0-1
  severity: Severity;
  recommendation: string;
  /** Stable id of (rule, file, secret) — safe to store, reveals nothing about the secret. */
  fingerprint: string;
}

export interface DetectionResult {
  matches: SecretMatch[];
  summary: {
    totalMatches: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
  };
}

export interface SecretPattern {
  id: string;
  name: string;
  regex: RegExp;
  severity: Severity;
  /** Capture group holding the secret (default: whole match). */
  group?: number;
  minEntropy?: number;
  /** Generic rules yield to specific ones when matches overlap. */
  generic?: boolean;
  recommendation: string;
}

const ROTATE = 'Revoke/rotate it at the provider now, then load it from a secret manager or env var.';

export const SECRET_PATTERNS: SecretPattern[] = [
  // --- Cloud providers -----------------------------------------------------
  {
    id: 'aws-access-key-id',
    name: 'AWS Access Key ID',
    regex: /\b((?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16})\b/g,
    group: 1,
    severity: 'critical',
    recommendation: `AWS access key. ${ROTATE}`,
  },
  {
    id: 'aws-secret-access-key',
    name: 'AWS Secret Access Key',
    regex: /aws_?secret_?(?:access_?)?key["']?\s*[:=]\s*["']?([A-Za-z0-9/+=]{40})(?![A-Za-z0-9/+=])/gi,
    group: 1,
    minEntropy: 4.0,
    severity: 'critical',
    recommendation: `AWS secret key. ${ROTATE}`,
  },
  {
    id: 'gcp-api-key',
    name: 'Google Cloud API Key',
    regex: /\b(AIza[0-9A-Za-z_-]{35})(?![0-9A-Za-z_-])/g,
    group: 1,
    severity: 'high',
    recommendation: 'Google API key. Restrict it to specific APIs/referrers and rotate it.',
  },
  {
    id: 'gcp-oauth-token',
    name: 'Google OAuth Access Token',
    regex: /\b(ya29\.[0-9A-Za-z_-]{20,})/g,
    group: 1,
    severity: 'critical',
    recommendation: `Google OAuth token. ${ROTATE}`,
  },
  {
    id: 'digitalocean-token',
    name: 'DigitalOcean Token',
    regex: /\b(do[por]_v1_[a-f0-9]{64})\b/g,
    group: 1,
    severity: 'critical',
    recommendation: `DigitalOcean token. ${ROTATE}`,
  },

  // --- AI providers ----------------------------------------------------------
  {
    id: 'anthropic-api-key',
    name: 'Anthropic API Key',
    regex: /\b(sk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{80,})/g,
    group: 1,
    severity: 'critical',
    recommendation: `Anthropic API key. ${ROTATE}`,
  },
  {
    id: 'openai-api-key',
    name: 'OpenAI API Key',
    regex:
      /\b(sk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{40,}|sk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}|sk-[A-Za-z0-9]{48})(?![A-Za-z0-9_-])/g,
    group: 1,
    severity: 'critical',
    recommendation: `OpenAI API key. ${ROTATE}`,
  },
  {
    id: 'huggingface-token',
    name: 'Hugging Face Token',
    regex: /\b(hf_[A-Za-z]{34})\b/g,
    group: 1,
    severity: 'high',
    recommendation: `Hugging Face token. ${ROTATE}`,
  },

  // --- Payments / commerce ---------------------------------------------------
  {
    id: 'stripe-live-secret',
    name: 'Stripe Live Secret Key',
    regex: /\b((?:sk|rk)_live_[0-9a-zA-Z]{24,})\b/g,
    group: 1,
    severity: 'critical',
    recommendation: `Stripe live key — can move money. ${ROTATE}`,
  },
  {
    id: 'stripe-test-secret',
    name: 'Stripe Test Secret Key',
    regex: /\b((?:sk|rk)_test_[0-9a-zA-Z]{24,})\b/g,
    group: 1,
    severity: 'medium',
    recommendation: 'Stripe test key. Move it to env vars; test keys still expose your account data.',
  },
  {
    id: 'stripe-webhook-secret',
    name: 'Stripe Webhook Signing Secret',
    regex: /\b(whsec_[0-9a-zA-Z]{32,})\b/g,
    group: 1,
    severity: 'high',
    recommendation: 'Stripe webhook secret — lets anyone forge billing events. Roll it in the dashboard.',
  },
  {
    id: 'shopify-token',
    name: 'Shopify Access Token',
    regex: /\b(shp(?:at|ca|pa|ss)_[a-fA-F0-9]{32})\b/g,
    group: 1,
    severity: 'critical',
    recommendation: `Shopify token. ${ROTATE}`,
  },

  // --- Source control / package registries -----------------------------------
  {
    id: 'github-token',
    name: 'GitHub Token',
    regex: /\b(gh[pousr]_[A-Za-z0-9]{36,255})\b/g,
    group: 1,
    severity: 'critical',
    recommendation: `GitHub token. ${ROTATE}`,
  },
  {
    id: 'github-fine-grained-pat',
    name: 'GitHub Fine-grained PAT',
    regex: /\b(github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59})\b/g,
    group: 1,
    severity: 'critical',
    recommendation: `GitHub fine-grained token. ${ROTATE}`,
  },
  {
    id: 'npm-token',
    name: 'npm Access Token',
    regex: /\b(npm_[A-Za-z0-9]{36})\b/g,
    group: 1,
    severity: 'critical',
    recommendation: `npm token — allows publishing packages as you. ${ROTATE}`,
  },
  {
    id: 'pypi-token',
    name: 'PyPI Upload Token',
    regex: /\b(pypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,})/g,
    group: 1,
    severity: 'critical',
    recommendation: `PyPI token. ${ROTATE}`,
  },

  // --- Messaging -------------------------------------------------------------
  {
    id: 'slack-token',
    name: 'Slack Token',
    regex: /\b(xox[abposr]-[0-9A-Za-z-]{10,250}|xapp-\d-[A-Z0-9]+-\d+-[a-f0-9]{32,})\b/g,
    group: 1,
    severity: 'critical',
    recommendation: `Slack token. ${ROTATE}`,
  },
  {
    id: 'slack-webhook',
    name: 'Slack Webhook URL',
    regex: /(https:\/\/hooks\.slack\.com\/services\/T[A-Za-z0-9_]+\/B[A-Za-z0-9_]+\/[A-Za-z0-9_]+)/g,
    group: 1,
    severity: 'high',
    recommendation: 'Slack webhook — anyone can post to your channel. Regenerate it.',
  },
  {
    id: 'telegram-bot-token',
    name: 'Telegram Bot Token',
    regex: /\b(\d{8,10}:AA[0-9A-Za-z_-]{33})(?![0-9A-Za-z_-])/g,
    group: 1,
    severity: 'high',
    recommendation: 'Telegram bot token. Revoke it with @BotFather.',
  },
  {
    id: 'twilio-api-key',
    name: 'Twilio API Key',
    regex: /\b(SK[0-9a-f]{32})\b/g,
    group: 1,
    severity: 'high',
    recommendation: `Twilio API key. ${ROTATE}`,
  },
  {
    id: 'sendgrid-api-key',
    name: 'SendGrid API Key',
    regex: /\b(SG\.[0-9A-Za-z_-]{22}\.[0-9A-Za-z_-]{43})(?![0-9A-Za-z_-])/g,
    group: 1,
    severity: 'critical',
    recommendation: `SendGrid key. ${ROTATE}`,
  },

  // --- Keys & connection strings ---------------------------------------------
  {
    id: 'private-key',
    name: 'Private Key',
    // Only a real key: the header alone on its line (PEM file / heredoc), or
    // followed by an escaped newline and key body (JSON, e.g. GCP service
    // accounts). A header merely mentioned in code or docs is not a leak.
    regex:
      /(-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----)(?=[ \t]*$|\\n[A-Za-z0-9+/=]{16,})/g,
    group: 1,
    severity: 'critical',
    recommendation: 'Private key material. Treat it as compromised: re-issue the key/cert.',
  },
  {
    id: 'connection-string-password',
    name: 'Credential in Connection String',
    regex:
      /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?|amqps?|mssql|sqlserver):\/\/[^\s:@/'"`]+:([^\s@/'"`]{3,})@[^\s'"`]+/gi,
    group: 1,
    severity: 'critical',
    recommendation: 'Database password in a URL. Rotate the DB user password and use env vars.',
  },
  {
    id: 'jwt',
    name: 'JSON Web Token',
    regex: /\b(eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/g,
    group: 1,
    minEntropy: 3.5,
    severity: 'medium',
    recommendation: 'Hard-coded JWT (e.g. a Supabase service_role key). Move it to secure storage.',
  },

  // --- Generic (lowest priority) ---------------------------------------------
  {
    id: 'generic-assignment',
    name: 'Generic Secret Assignment',
    regex:
      /(?:api[_-]?key|apikey|secret|token|passw(?:or)?d|pwd|credential|auth[_-]?key|private[_-]?key|access[_-]?key)[A-Za-z0-9_]*["']?\s*(?::=|=>|[:=])\s*["'`]([^"'`\s]{16,})["'`]/gi,
    group: 1,
    minEntropy: 3.7,
    generic: true,
    severity: 'high',
    recommendation: 'Looks like a hard-coded credential. Move it to env vars / a secret manager.',
  },
];

const ALLOW_MARKERS = ['secretforge:allow', 'sf-ignore', 'gitleaks:allow', 'nosecret', 'pragma: allowlist secret'];

const PLACEHOLDER_RE =
  /^(?:x+|\*+|\.+|-+|0+|1234.*|test|dummy|changeme|change_me|placeholder|your[_-].*|<.*>|\$\{.*\}|\{\{.*\}\}|%\(.*\)s|.*example.*|.*redacted.*|.*xxxx.*|password|secret|null|undefined|none)$/i;

/** Known public documentation values (AWS docs, etc.). */
const KNOWN_DOC_VALUES = new Set([
  'AKIAIOSFODNN7EXAMPLE',
  'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
]);

export interface SecretDetectorConfig {
  customPatterns?: SecretPattern[];
  /** Replace the built-in rules entirely. */
  patterns?: SecretPattern[];
  entropyCacheSize?: number;
  /** Lines longer than this are truncated before matching (minified bundles). */
  maxLineLength?: number;
}

export class SecretDetector {
  private patterns: SecretPattern[];
  private entropyCache = new Map<string, number>();
  private readonly maxCacheSize: number;
  private readonly maxLineLength: number;

  constructor(config?: SecretDetectorConfig) {
    this.patterns = [...(config?.patterns ?? SECRET_PATTERNS), ...(config?.customPatterns ?? [])];
    this.maxCacheSize = config?.entropyCacheSize ?? 1000;
    this.maxLineLength = config?.maxLineLength ?? 20_000;
  }

  get rules(): readonly SecretPattern[] {
    return this.patterns;
  }

  /** Scan a single line. `lineNumber` is 1-based. */
  scanLine(line: string, file: string, lineNumber: number, commit?: string): SecretMatch[] {
    if (!line) return [];
    if (line.length > this.maxLineLength) line = line.slice(0, this.maxLineLength);
    const lower = line.toLowerCase();
    if (ALLOW_MARKERS.some((m) => lower.includes(m))) return [];

    const found: Array<SecretMatch & { start: number; end: number; generic: boolean }> = [];

    for (const pattern of this.patterns) {
      pattern.regex.lastIndex = 0;
      for (const match of line.matchAll(pattern.regex)) {
        const g = pattern.group ?? 0;
        const value = match[g];
        if (!value) continue;
        const offset = match.index ?? 0;
        const start = g === 0 ? offset : offset + match[0].indexOf(value);
        const end = start + value.length;

        if (isPlaceholder(value)) continue;
        if (pattern.minEntropy && this.entropy(value) < pattern.minEntropy) continue;

        // Specific rules win over generic ones; first rule wins among equals.
        const overlapping = found.find((f) => start < f.end && f.start < end);
        if (overlapping) {
          if (overlapping.generic && !pattern.generic) {
            found.splice(found.indexOf(overlapping), 1);
          } else {
            continue;
          }
        }

        found.push({
          ruleId: pattern.id,
          type: pattern.name,
          value,
          maskedValue: maskSecret(value),
          location: { file, line: lineNumber, column: start + 1, ...(commit ? { commit } : {}) },
          confidence: calculateConfidence(line, value, pattern, this.entropy(value)),
          severity: pattern.severity,
          recommendation: pattern.recommendation,
          fingerprint: fingerprint(pattern.id, file, value),
          start,
          end,
          generic: !!pattern.generic,
        });
      }
    }

    return found.map(({ start: _s, end: _e, generic: _g, ...m }) => m);
  }

  scanFile(content: string, filename: string): SecretMatch[] {
    if (!content) return [];
    if (content.includes('\u0000')) return []; // binary
    const lines = content.split(/\r?\n/);
    const matches: SecretMatch[] = [];
    for (let i = 0; i < lines.length; i++) {
      matches.push(...this.scanLine(lines[i], filename, i + 1));
    }
    return matches;
  }

  scanFiles(files: Record<string, string>): DetectionResult {
    const all: SecretMatch[] = [];
    for (const [filename, content] of Object.entries(files)) {
      all.push(...this.scanFile(content, filename));
    }
    return { matches: all, summary: summarize(all) };
  }

  /**
   * Scan unified-diff text (e.g. `git diff --cached -U0` or `git log -p`).
   * Only added lines are scanned, with their real line numbers in the new file.
   * Commit headers of the form `commit <sha>` are tracked for history scans.
   */
  scanDiff(diff: string): SecretMatch[] {
    const matches: SecretMatch[] = [];
    let file = '';
    let line = 0;
    let commit: string | undefined;
    for (const raw of diff.split('\n')) {
      if (raw.startsWith('commit ') && /^commit [0-9a-f]{7,40}\b/.test(raw)) {
        commit = raw.slice(7, 47).trim().split(/\s/)[0];
        continue;
      }
      if (raw.startsWith('+++ ')) {
        const p = raw.slice(4).trim();
        file = p === '/dev/null' ? '' : p.replace(/^b\//, '');
        continue;
      }
      if (raw.startsWith('@@')) {
        const m = raw.match(/\+(\d+)(?:,\d+)?/);
        line = m ? parseInt(m[1], 10) : 0;
        continue;
      }
      if (!file) continue;
      if (raw.startsWith('+')) {
        matches.push(...this.scanLine(raw.slice(1), file, line, commit));
        line++;
      } else if (raw.startsWith(' ')) {
        line++;
      }
    }
    return matches;
  }

  /** @deprecated use scanDiff on `git log -p` output. */
  scanGitHistory(gitLog: string): SecretMatch[] {
    return this.scanDiff(gitLog);
  }

  private entropy(value: string): number {
    const cached = this.entropyCache.get(value);
    if (cached !== undefined) return cached;
    const e = calculateEntropy(value);
    if (this.entropyCache.size < this.maxCacheSize) this.entropyCache.set(value, e);
    return e;
  }
}

export function summarize(matches: SecretMatch[]): DetectionResult['summary'] {
  return {
    totalMatches: matches.length,
    criticalCount: matches.filter((m) => m.severity === 'critical').length,
    highCount: matches.filter((m) => m.severity === 'high').length,
    mediumCount: matches.filter((m) => m.severity === 'medium').length,
    lowCount: matches.filter((m) => m.severity === 'low').length,
  };
}

export const SEVERITY_RANK: Record<Severity, number> = { low: 1, medium: 2, high: 3, critical: 4 };

function isPlaceholder(value: string): boolean {
  if (KNOWN_DOC_VALUES.has(value)) return true;
  if (/EXAMPLE/.test(value)) return true;
  if (PLACEHOLDER_RE.test(value)) return true;
  // Template / interpolation rather than a literal.
  if (/^\$[A-Z_]+$|^process\.env|^os\.environ|^\$\{/.test(value)) return true;
  return false;
}

export function calculateEntropy(str: string): number {
  if (!str) return 0;
  const freq = new Map<string, number>();
  for (const ch of str) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / str.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function calculateConfidence(line: string, value: string, pattern: SecretPattern, entropy: number): number {
  let confidence = pattern.generic ? 0.55 : 0.85;
  const lower = line.toLowerCase().trim();

  if (/[=:]/.test(lower)) confidence += 0.05;
  if (/(secret|key|token|password|credential|api)/.test(lower)) confidence += 0.05;
  if (lower.startsWith('//') || lower.startsWith('#') || lower.startsWith('*')) confidence -= 0.2;
  if (/(example|placeholder|sample|dummy|fake|mock)/.test(lower)) confidence -= 0.35;
  if (pattern.minEntropy && entropy > pattern.minEntropy + 0.8) confidence += 0.05;
  if (value.length < 12) confidence -= 0.1;

  return Math.round(Math.max(0, Math.min(1, confidence)) * 100) / 100;
}

export function maskSecret(value: string): string {
  if (value.length <= 12) return '*'.repeat(Math.max(8, value.length));
  // Show at most a recognisable prefix (≤ 4 chars) — never enough to reconstruct.
  const prefix = value.slice(0, Math.min(4, Math.floor(value.length / 8)));
  return `${prefix}${'*'.repeat(12)}(${value.length} chars)`;
}

/** FNV-1a 64-bit → hex. Deterministic, dependency-free, one-way enough for baselining. */
export function fingerprint(ruleId: string, file: string, value: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  const input = `${ruleId}\u0000${file}\u0000${value}`;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c ^ (h1 >>> 7), 0x01000193) >>> 0;
  }
  return `${ruleId}:${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

/**
 * Pre-commit hook body. Uses the locally installed CLI only — `npx --no`
 * never downloads from the registry (the old hook ran `npx secretforge scan`,
 * a command that did not exist, and npx would happily fetch whatever package
 * currently owns that name on npm).
 */
export function generatePreCommitHook(options?: { failOn?: Severity }): string {
  const failOn = options?.failOn ?? 'high';
  return `# >>> secretforge >>>
# Blocks commits that add secrets. Bypass for a false positive with an inline
# "secretforge:allow" comment, or (not recommended) git commit --no-verify.
if command -v sf >/dev/null 2>&1; then
  sf scan --staged --fail-on ${failOn} || exit 1
elif [ -x ./node_modules/.bin/sf ]; then
  ./node_modules/.bin/sf scan --staged --fail-on ${failOn} || exit 1
else
  echo "secretforge: 'sf' CLI not found; skipping secret scan" >&2
fi
# <<< secretforge <<<
`;
}
