/**
 * Advanced Secret Detection Engine
 * Detects exposed secrets in code using pattern matching and entropy analysis
 */

export interface SecretMatch {
  type: string;
  value: string;
  maskedValue: string;
  location: {
    file: string;
    line: number;
    column: number;
  };
  confidence: number; // 0-1
  severity: 'critical' | 'high' | 'medium' | 'low';
  recommendation: string;
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

/**
 * Secret patterns with regex and metadata
 */
interface SecretPattern {
  name: string;
  regex: RegExp;
  severity: 'critical' | 'high' | 'medium' | 'low';
  minEntropy?: number;
  recommendation: string;
}

const SECRET_PATTERNS: SecretPattern[] = [
  // AWS
  {
    name: 'AWS Access Key ID',
    regex: /AKIA[0-9A-Z]{16}/g,
    severity: 'critical',
    recommendation: 'Immediately rotate this AWS access key and use AWS Secrets Manager.',
  },
  {
    name: 'AWS Secret Access Key',
    regex: /aws_secret_access_key\s*=\s*['"']?([A-Za-z0-9/+=]{40})['"']?/g,
    severity: 'critical',
    recommendation: 'Immediately rotate this AWS secret and use environment variables.',
  },

  // Stripe
  {
    name: 'Stripe Live Secret Key',
    regex: /sk_live_[0-9a-zA-Z]{24,}/g,
    severity: 'critical',
    recommendation: 'Immediately rotate this Stripe secret key and use environment variables.',
  },
  {
    name: 'Stripe Live Publishable Key',
    regex: /pk_live_[0-9a-zA-Z]{24,}/g,
    severity: 'high',
    recommendation: 'Move this Stripe publishable key to environment variables.',
  },
  {
    name: 'Stripe Test Secret Key',
    regex: /sk_test_[0-9a-zA-Z]{24,}/g,
    severity: 'medium',
    recommendation: 'Move test keys to environment variables for consistency.',
  },

  // GitHub
  {
    name: 'GitHub Personal Access Token',
    regex: /ghp_[0-9a-zA-Z]{36}/g,
    severity: 'critical',
    recommendation: 'Immediately revoke and regenerate this GitHub token.',
  },
  {
    name: 'GitHub OAuth Token',
    regex: /gho_[0-9a-zA-Z]{36}/g,
    severity: 'critical',
    recommendation: 'Immediately revoke this GitHub OAuth token.',
  },
  {
    name: 'GitHub App Token',
    regex: /ghu_[0-9a-zA-Z]{36}/g,
    severity: 'critical',
    recommendation: 'Immediately revoke this GitHub App token.',
  },

  // OpenAI
  {
    name: 'OpenAI API Key',
    regex: /sk-[a-zA-Z0-9]{48}/g,
    severity: 'critical',
    recommendation: 'Immediately rotate this OpenAI API key and use environment variables.',
  },

  // Anthropic
  {
    name: 'Anthropic API Key',
    regex: /sk-ant-[a-zA-Z0-9-]{95}/g,
    severity: 'critical',
    recommendation: 'Immediately rotate this Anthropic API key.',
  },

  // Google Cloud
  {
    name: 'Google Cloud API Key',
    regex: /AIza[0-9A-Za-z\\-_]{35}/g,
    severity: 'high',
    recommendation: 'Rotate this Google Cloud API key and restrict its usage.',
  },
  {
    name: 'Google OAuth Token',
    regex: /ya29\\.[0-9A-Za-z\\-_]+/g,
    severity: 'critical',
    recommendation: 'Revoke this Google OAuth token immediately.',
  },

  // Slack
  {
    name: 'Slack Bot Token',
    regex: /xoxb-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}/g,
    severity: 'critical',
    recommendation: 'Rotate this Slack bot token immediately.',
  },
  {
    name: 'Slack Webhook URL',
    regex: /https:\/\/hooks\.slack\.com\/services\/T[a-zA-Z0-9_]+\/B[a-zA-Z0-9_]+\/[a-zA-Z0-9_]+/g,
    severity: 'high',
    recommendation: 'Regenerate this Slack webhook URL and use environment variables.',
  },

  // Twilio
  {
    name: 'Twilio API Key',
    regex: /SK[0-9a-fA-F]{32}/g,
    severity: 'critical',
    recommendation: 'Rotate this Twilio API key immediately.',
  },

  // SendGrid
  {
    name: 'SendGrid API Key',
    regex: /SG\.[0-9A-Za-z\-_]{22}\.[0-9A-Za-z\-_]{43}/g,
    severity: 'critical',
    recommendation: 'Rotate this SendGrid API key immediately.',
  },

  // JWT Tokens
  {
    name: 'JWT Token',
    regex: /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g,
    severity: 'medium',
    minEntropy: 3.5,
    recommendation: 'Remove hardcoded JWT tokens and use secure token storage.',
  },

  // Private Keys
  {
    name: 'RSA Private Key',
    regex: /-----BEGIN RSA PRIVATE KEY-----/g,
    severity: 'critical',
    recommendation: 'Remove private keys from code and use secure key management.',
  },
  {
    name: 'OpenSSH Private Key',
    regex: /-----BEGIN OPENSSH PRIVATE KEY-----/g,
    severity: 'critical',
    recommendation: 'Remove private keys from code and use SSH agent or key manager.',
  },

  // Database Connection Strings
  {
    name: 'PostgreSQL Connection String',
    regex: /postgres:\/\/[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+@[a-zA-Z0-9.-]+:[0-9]+\/[a-zA-Z0-9_-]+/g,
    severity: 'critical',
    recommendation: 'Move database credentials to environment variables.',
  },
  {
    name: 'MongoDB Connection String',
    regex: /mongodb(\+srv)?:\/\/[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+@[a-zA-Z0-9.-]+/g,
    severity: 'critical',
    recommendation: 'Move database credentials to environment variables.',
  },

  // Generic API Keys (high entropy)
  {
    name: 'Generic API Key',
    regex: /api[_-]?key\s*[=:]\s*['"']?([a-zA-Z0-9_\-]{20,})['"']?/gi,
    severity: 'high',
    minEntropy: 4.0,
    recommendation: 'Move API keys to environment variables.',
  },
  {
    name: 'Generic Secret',
    regex: /secret\s*[=:]\s*['"']?([a-zA-Z0-9_\-]{20,})['"']?/gi,
    severity: 'high',
    minEntropy: 4.0,
    recommendation: 'Move secrets to environment variables.',
  },
];

/**
 * Main secret detector class
 */
export class SecretDetector {
  private patterns: SecretPattern[];

  constructor(customPatterns?: SecretPattern[]) {
    this.patterns = [...SECRET_PATTERNS, ...(customPatterns || [])];
  }

  /**
   * Scan a single file for secrets
   */
  scanFile(content: string, filename: string): SecretMatch[] {
    const matches: SecretMatch[] = [];
    const lines = content.split('\n');

    for (const pattern of this.patterns) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineMatches = line.matchAll(pattern.regex);

        for (const match of lineMatches) {
          const value = match[1] || match[0];

          // Skip if entropy check is required and fails
          if (pattern.minEntropy && calculateEntropy(value) < pattern.minEntropy) {
            continue;
          }

          // Calculate confidence based on context
          const confidence = calculateConfidence(line, value, pattern);

          matches.push({
            type: pattern.name,
            value,
            maskedValue: maskSecret(value),
            location: {
              file: filename,
              line: i + 1,
              column: match.index || 0,
            },
            confidence,
            severity: pattern.severity,
            recommendation: pattern.recommendation,
          });
        }
      }
    }

    return matches;
  }

  /**
   * Scan multiple files
   */
  scanFiles(files: Record<string, string>): DetectionResult {
    let allMatches: SecretMatch[] = [];

    for (const [filename, content] of Object.entries(files)) {
      const matches = this.scanFile(content, filename);
      allMatches = [...allMatches, ...matches];
    }

    // Calculate summary
    const summary = {
      totalMatches: allMatches.length,
      criticalCount: allMatches.filter((m) => m.severity === 'critical').length,
      highCount: allMatches.filter((m) => m.severity === 'high').length,
      mediumCount: allMatches.filter((m) => m.severity === 'medium').length,
      lowCount: allMatches.filter((m) => m.severity === 'low').length,
    };

    return {
      matches: allMatches,
      summary,
    };
  }

  /**
   * Scan git history for secrets (works with git log output)
   */
  scanGitHistory(gitLog: string): SecretMatch[] {
    const matches: SecretMatch[] = [];
    const commits = gitLog.split('commit ');

    for (const commit of commits) {
      if (!commit.trim()) continue;

      const lines = commit.split('\n');
      const commitHash = lines[0]?.trim().substring(0, 7);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        for (const pattern of this.patterns) {
          const lineMatches = line.matchAll(pattern.regex);

          for (const match of lineMatches) {
            const value = match[1] || match[0];

            if (pattern.minEntropy && calculateEntropy(value) < pattern.minEntropy) {
              continue;
            }

            matches.push({
              type: pattern.name,
              value,
              maskedValue: maskSecret(value),
              location: {
                file: `git:${commitHash}`,
                line: i + 1,
                column: match.index || 0,
              },
              confidence: 0.8,
              severity: pattern.severity,
              recommendation: `${pattern.recommendation} Found in git history (${commitHash}).`,
            });
          }
        }
      }
    }

    return matches;
  }
}

/**
 * Calculate Shannon entropy of a string
 */
function calculateEntropy(str: string): number {
  const freq: Record<string, number> = {};

  for (const char of str) {
    freq[char] = (freq[char] || 0) + 1;
  }

  let entropy = 0;
  const len = str.length;

  for (const count of Object.values(freq)) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}

/**
 * Calculate confidence score based on context
 */
function calculateConfidence(line: string, value: string, pattern: SecretPattern): number {
  let confidence = 0.7; // Base confidence

  const lowerLine = line.toLowerCase();

  // Increase confidence if in assignment or config
  if (lowerLine.includes('=') || lowerLine.includes(':')) {
    confidence += 0.1;
  }

  // Increase confidence for specific keywords
  const keywords = ['secret', 'key', 'token', 'password', 'credential', 'api'];
  if (keywords.some((kw) => lowerLine.includes(kw))) {
    confidence += 0.1;
  }

  // Decrease confidence if in comments or docs
  if (lowerLine.trim().startsWith('//') || lowerLine.trim().startsWith('#')) {
    confidence -= 0.3;
  }

  // Decrease confidence for example/placeholder patterns
  const placeholders = ['example', 'placeholder', 'xxx', 'sample', 'demo'];
  if (placeholders.some((ph) => lowerLine.includes(ph))) {
    confidence -= 0.4;
  }

  // Entropy boost
  if (pattern.minEntropy) {
    const entropy = calculateEntropy(value);
    if (entropy > pattern.minEntropy + 1) {
      confidence += 0.1;
    }
  }

  return Math.max(0, Math.min(1, confidence));
}

/**
 * Mask secret value for safe display
 */
function maskSecret(value: string): string {
  if (value.length <= 8) {
    return '*'.repeat(value.length);
  }

  const visibleStart = value.substring(0, 4);
  const visibleEnd = value.substring(value.length - 4);
  const masked = '*'.repeat(Math.max(8, value.length - 8));

  return `${visibleStart}${masked}${visibleEnd}`;
}

/**
 * Pre-commit hook generator
 */
export function generatePreCommitHook(options?: { failOnHigh?: boolean }): string {
  return `#!/bin/sh
# SecretForge AI Pre-commit Hook
# Prevents committing secrets

echo "🔍 SecretForge: Scanning for exposed secrets..."

# Get staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

# Run SecretForge scan
npx secretforge scan --staged

if [ $? -ne 0 ]; then
  echo "❌ SecretForge: Secrets detected! Commit blocked."
  echo "Run 'secretforge scan' to see details."
  exit 1
fi

echo "✅ SecretForge: No secrets detected. Proceeding with commit."
exit 0
`;
}
