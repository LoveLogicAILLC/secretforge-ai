/**
 * Secret detection patterns.
 *
 * Ordered most-specific first: the scanner keeps the first match for any
 * overlapping region, so provider-specific patterns win over generic ones.
 */

import { DiagnosticSeverity } from "vscode-languageserver/node";
import { SecretPattern } from "./types";

export const SECRET_PATTERNS: SecretPattern[] = [
  // ---- AWS ----
  {
    regex: /AKIA[0-9A-Z]{16}/g,
    type: "AWS Access Key",
    service: "aws",
    severity: DiagnosticSeverity.Error,
    description: "AWS access key ID committed to source",
    remediation: "Deactivate the key in IAM, rotate it, and read it from the environment.",
  },
  {
    regex: /aws_secret_access_key\s*=\s*["']?([A-Za-z0-9/+=]{40})["']?/gi,
    type: "AWS Secret Access Key",
    service: "aws",
    severity: DiagnosticSeverity.Error,
    description: "AWS secret access key committed to source",
    remediation: "Rotate in IAM immediately; this grants full programmatic access.",
  },

  // ---- Anthropic (before the generic sk- rule) ----
  {
    regex: /sk-ant-[A-Za-z0-9_-]{20,}/g,
    type: "Anthropic API Key",
    service: "anthropic",
    severity: DiagnosticSeverity.Error,
    description: "Anthropic Claude API key committed to source",
    remediation: "Revoke at console.anthropic.com and load from the environment.",
  },

  // ---- OpenAI ----
  {
    regex: /sk-proj-[A-Za-z0-9_-]{20,}/g,
    type: "OpenAI Project Key",
    service: "openai",
    severity: DiagnosticSeverity.Error,
    description: "OpenAI project API key committed to source",
    remediation: "Revoke at platform.openai.com/api-keys and rotate.",
  },
  {
    regex: /sk-[A-Za-z0-9]{48}/g,
    type: "OpenAI API Key",
    service: "openai",
    severity: DiagnosticSeverity.Error,
    description: "OpenAI API key committed to source",
    remediation: "Revoke at platform.openai.com/api-keys and rotate.",
  },

  // ---- Stripe ----
  {
    regex: /sk_live_[0-9a-zA-Z]{24,}/g,
    type: "Stripe Live Secret Key",
    service: "stripe",
    severity: DiagnosticSeverity.Error,
    description: "Stripe LIVE secret key — production payment credentials exposed",
    remediation: "Roll the key in the Stripe dashboard now; it can move real money.",
  },
  {
    regex: /rk_live_[0-9a-zA-Z]{24,}/g,
    type: "Stripe Live Restricted Key",
    service: "stripe",
    severity: DiagnosticSeverity.Error,
    description: "Stripe live restricted key committed to source",
    remediation: "Roll the key in the Stripe dashboard.",
  },
  {
    regex: /sk_test_[0-9a-zA-Z]{24,}/g,
    type: "Stripe Test Key",
    service: "stripe",
    severity: DiagnosticSeverity.Warning,
    description: "Stripe test secret key committed to source",
    remediation: "Test keys are low risk, but keep them in the environment too.",
  },

  // ---- GitHub ----
  {
    regex: /ghp_[A-Za-z0-9]{36}/g,
    type: "GitHub Personal Access Token",
    service: "github",
    severity: DiagnosticSeverity.Error,
    description: "GitHub personal access token committed to source",
    remediation: "Revoke at github.com/settings/tokens.",
  },
  {
    regex: /gho_[A-Za-z0-9]{36}/g,
    type: "GitHub OAuth Token",
    service: "github",
    severity: DiagnosticSeverity.Error,
    description: "GitHub OAuth access token committed to source",
    remediation: "Revoke the token and re-authorize the app.",
  },
  {
    regex: /ghs_[A-Za-z0-9]{36}/g,
    type: "GitHub App Token",
    service: "github",
    severity: DiagnosticSeverity.Error,
    description: "GitHub app installation token committed to source",
    remediation: "Revoke the installation token.",
  },
  {
    regex: /github_pat_[A-Za-z0-9_]{60,}/g,
    type: "GitHub Fine-Grained PAT",
    service: "github",
    severity: DiagnosticSeverity.Error,
    description: "GitHub fine-grained personal access token committed to source",
    remediation: "Revoke at github.com/settings/tokens.",
  },

  // ---- Google ----
  {
    regex: /AIza[0-9A-Za-z_-]{35}/g,
    type: "Google API Key",
    service: "google",
    severity: DiagnosticSeverity.Error,
    description: "Google API key committed to source",
    remediation: "Restrict and regenerate at console.cloud.google.com.",
  },

  // ---- Slack ----
  {
    regex: /xox[baprs]-[0-9A-Za-z-]{10,72}/g,
    type: "Slack Token",
    service: "slack",
    severity: DiagnosticSeverity.Error,
    description: "Slack API token committed to source",
    remediation: "Revoke at api.slack.com/apps and rotate.",
  },

  // ---- SendGrid ----
  {
    regex: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/g,
    type: "SendGrid API Key",
    service: "sendgrid",
    severity: DiagnosticSeverity.Error,
    description: "SendGrid API key committed to source",
    remediation: "Delete the key at app.sendgrid.com and issue a new one.",
  },

  // ---- Twilio ----
  {
    regex: /SK[0-9a-fA-F]{32}/g,
    type: "Twilio API Key",
    service: "twilio",
    severity: DiagnosticSeverity.Error,
    description: "Twilio API key SID committed to source",
    remediation: "Delete the key in the Twilio console and reissue.",
  },

  // ---- Private keys ----
  {
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/g,
    type: "Private Key",
    service: "unknown",
    severity: DiagnosticSeverity.Error,
    description: "Private key block committed to source",
    remediation: "Remove the key, rotate the key pair, and purge it from git history.",
  },

  // ---- Generic (entropy-gated to limit false positives) ----
  {
    regex:
      /["']?[A-Za-z0-9_-]*(?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token)["']?\s*[:=]\s*["']([A-Za-z0-9_\-.]{20,})["']/gi,
    type: "Generic API Key",
    service: "unknown",
    severity: DiagnosticSeverity.Warning,
    description: "Hard-coded API key or access token",
    remediation: "Read it from the environment instead of committing the literal.",
  },
  {
    regex: /["']?(?:client[_-]?)?secret["']?\s*[:=]\s*["']([A-Za-z0-9_\-.]{20,})["']/gi,
    type: "Generic Secret",
    service: "unknown",
    severity: DiagnosticSeverity.Warning,
    description: "Hard-coded secret literal",
    remediation: "Read it from the environment instead of committing the literal.",
  },
];

/**
 * Patterns whose matches are only reported when the captured literal looks
 * random. Provider-prefixed keys are self-identifying and skip this check.
 */
const ENTROPY_GATED_TYPES = new Set(["Generic API Key", "Generic Secret"]);

const MIN_ENTROPY_BITS = 3.0;

export function isEntropyGated(patternType: string): boolean {
  return ENTROPY_GATED_TYPES.has(patternType);
}

/**
 * Shannon entropy in bits per character. Random tokens land above ~3.5;
 * English words and repeated placeholders fall well below.
 */
export function shannonEntropy(value: string): number {
  if (!value) return 0;

  const counts = new Map<string, number>();
  for (const char of value) {
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }

  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

const PLACEHOLDER_MARKERS = [
  "your-key",
  "your_key",
  "yourkey",
  "your-api",
  "your_api",
  "placeholder",
  "example",
  "changeme",
  "change-me",
  "replace-me",
  "replace_me",
  "insert-key",
  "dummy",
  "sample",
  "todo",
  "fixme",
  "xxxxx",
  "aaaaa",
  "12345",
  "abcdef",
  "<your",
  "test-key",
  "fake",
  "notreal",
  "redacted",
];

/**
 * True when the literal is obviously documentation or scaffolding rather than
 * a live credential.
 */
export function isPlaceholder(value: string): boolean {
  const lower = value.toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker));
}

/**
 * Final gate before a match becomes a diagnostic.
 */
export function shouldReport(pattern: SecretPattern, match: RegExpExecArray): boolean {
  const full = match[0];
  if (isPlaceholder(full)) return false;

  if (isEntropyGated(pattern.type)) {
    // Group 1 is the literal value for the generic patterns.
    const literal = match[1] ?? full;
    if (isPlaceholder(literal)) return false;
    if (shannonEntropy(literal) < MIN_ENTROPY_BITS) return false;
  }

  return true;
}

export function getPatternsByService(service: string): SecretPattern[] {
  return SECRET_PATTERNS.filter((p) => p.service === service);
}

export function getCriticalPatterns(): SecretPattern[] {
  return SECRET_PATTERNS.filter((p) => p.severity === DiagnosticSeverity.Error);
}

/**
 * Distinct services covered, used to build environment-variable completions.
 */
export function getKnownServices(): string[] {
  return [...new Set(SECRET_PATTERNS.map((p) => p.service))].filter(
    (s) => s !== "unknown"
  );
}
