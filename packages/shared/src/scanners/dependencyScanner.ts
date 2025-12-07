/**
 * Multi-language dependency scanner
 * Detects required API services from package manifests across multiple languages
 */

export interface DependencyScanResult {
  services: string[];
  confidence: Record<string, number>; // Service -> confidence score (0-1)
  language: string;
  packageManager: string;
  dependencies: Record<string, string>;
}

export interface ServicePattern {
  name: string;
  patterns: string[];
  confidence: number;
  scopes?: string[];
}

/**
 * Service detection patterns for all major services
 */
const SERVICE_PATTERNS: ServicePattern[] = [
  // Payment processors
  { name: "stripe", patterns: ["stripe", "@stripe/"], confidence: 0.99, scopes: ["read", "write"] },
  { name: "paypal", patterns: ["paypal", "@paypal/"], confidence: 0.99 },
  { name: "square", patterns: ["square"], confidence: 0.95 },

  // AI/ML services
  { name: "openai", patterns: ["openai"], confidence: 0.99, scopes: ["api.read", "api.write"] },
  { name: "anthropic", patterns: ["@anthropic-ai/sdk", "anthropic"], confidence: 0.99 },
  { name: "cohere", patterns: ["cohere-ai", "cohere"], confidence: 0.95 },
  { name: "huggingface", patterns: ["@huggingface/", "transformers"], confidence: 0.90 },

  // Cloud providers
  { name: "aws", patterns: ["aws-sdk", "@aws-sdk/"], confidence: 0.99, scopes: ["s3:read", "s3:write", "lambda:invoke"] },
  { name: "google-cloud", patterns: ["@google-cloud/", "googleapis"], confidence: 0.99 },
  { name: "azure", patterns: ["@azure/", "azure-"], confidence: 0.99 },

  // Databases
  { name: "mongodb", patterns: ["mongodb", "mongoose"], confidence: 0.99 },
  { name: "postgresql", patterns: ["pg", "postgres", "pg-promise", "psycopg2"], confidence: 0.95 },
  { name: "mysql", patterns: ["mysql", "mysql2", "PyMySQL"], confidence: 0.95 },
  { name: "redis", patterns: ["redis", "ioredis", "redis-py"], confidence: 0.95 },
  { name: "supabase", patterns: ["@supabase/"], confidence: 0.99 },

  // Communication
  { name: "twilio", patterns: ["twilio"], confidence: 0.99, scopes: ["messaging", "voice"] },
  { name: "sendgrid", patterns: ["@sendgrid/", "sendgrid"], confidence: 0.99, scopes: ["mail.send"] },
  { name: "mailgun", patterns: ["mailgun", "mailgun-js"], confidence: 0.95 },
  { name: "resend", patterns: ["resend"], confidence: 0.95 },

  // Auth & Identity
  { name: "auth0", patterns: ["auth0", "@auth0/"], confidence: 0.99 },
  { name: "clerk", patterns: ["@clerk/"], confidence: 0.99 },
  { name: "firebase", patterns: ["firebase", "@firebase/"], confidence: 0.95 },

  // Analytics
  { name: "segment", patterns: ["@segment/"], confidence: 0.95 },
  { name: "mixpanel", patterns: ["mixpanel"], confidence: 0.95 },
  { name: "posthog", patterns: ["posthog-"], confidence: 0.95 },

  // Version control
  { name: "github", patterns: ["@octokit/", "github"], confidence: 0.90 },
  { name: "gitlab", patterns: ["@gitlab/"], confidence: 0.90 },

  // Other
  { name: "shopify", patterns: ["@shopify/"], confidence: 0.95 },
  { name: "vercel", patterns: ["@vercel/"], confidence: 0.90 },
  { name: "cloudflare", patterns: ["@cloudflare/", "cloudflare"], confidence: 0.90 },
];

/**
 * Scan Node.js package.json dependencies
 */
export function scanNodeDependencies(packageJson: any): DependencyScanResult {
  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  const { services, confidence } = detectServices(dependencies);

  return {
    services,
    confidence,
    language: "javascript",
    packageManager: detectNodePackageManager(packageJson),
    dependencies,
  };
}

/**
 * Scan Python requirements.txt
 */
export function scanPythonDependencies(requirementsContent: string): DependencyScanResult {
  const dependencies: Record<string, string> = {};

  // Parse requirements.txt format
  const lines = requirementsContent.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Handle various formats: package, package==1.0.0, package>=1.0.0
    const match = trimmed.match(/^([a-zA-Z0-9_-]+)(?:[=<>]=?.*)?$/);
    if (match) {
      const packageName = match[1];
      dependencies[packageName] = "*";
    }
  }

  const { services, confidence } = detectServices(dependencies);

  return {
    services,
    confidence,
    language: "python",
    packageManager: "pip",
    dependencies,
  };
}

/**
 * Scan Go go.mod file
 */
export function scanGoDependencies(goModContent: string): DependencyScanResult {
  const dependencies: Record<string, string> = {};

  // Parse go.mod format
  const lines = goModContent.split("\n");
  let inRequire = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "require (") {
      inRequire = true;
      continue;
    }
    if (trimmed === ")") {
      inRequire = false;
      continue;
    }

    if (inRequire || trimmed.startsWith("require ")) {
      const match = trimmed.match(/(?:require )?([\w.\-/]+)\s+v?([\d.]+)/);
      if (match) {
        dependencies[match[1]] = match[2];
      }
    }
  }

  const { services, confidence } = detectServices(dependencies);

  return {
    services,
    confidence,
    language: "go",
    packageManager: "go",
    dependencies,
  };
}

/**
 * Scan Ruby Gemfile
 */
export function scanRubyDependencies(gemfileContent: string): DependencyScanResult {
  const dependencies: Record<string, string> = {};

  // Parse Gemfile format
  const lines = gemfileContent.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Match: gem 'name', 'version' or gem "name", "version"
    const match = trimmed.match(/gem\s+['"]([^'"]+)['"]\s*(?:,\s*['"]([^'"]+)['"])?/);
    if (match) {
      dependencies[match[1]] = match[2] || "*";
    }
  }

  const { services, confidence } = detectServices(dependencies);

  return {
    services,
    confidence,
    language: "ruby",
    packageManager: "bundler",
    dependencies,
  };
}

/**
 * Scan PHP composer.json
 */
export function scanPHPDependencies(composerJson: any): DependencyScanResult {
  const dependencies = {
    ...composerJson.require,
    ...composerJson["require-dev"],
  };

  const { services, confidence } = detectServices(dependencies);

  return {
    services,
    confidence,
    language: "php",
    packageManager: "composer",
    dependencies,
  };
}

/**
 * Scan Rust Cargo.toml
 */
export function scanRustDependencies(cargoTomlContent: string): DependencyScanResult {
  const dependencies: Record<string, string> = {};

  // Parse Cargo.toml format (basic)
  const lines = cargoTomlContent.split("\n");
  let inDependencies = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "[dependencies]" || trimmed === "[dev-dependencies]") {
      inDependencies = true;
      continue;
    }
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      inDependencies = false;
      continue;
    }

    if (inDependencies) {
      const match = trimmed.match(/^([\w-]+)\s*=\s*"([^"]+)"/);
      if (match) {
        dependencies[match[1]] = match[2];
      }
    }
  }

  const { services, confidence } = detectServices(dependencies);

  return {
    services,
    confidence,
    language: "rust",
    packageManager: "cargo",
    dependencies,
  };
}

/**
 * Core service detection logic
 * Optimized: Single pass through dependencies instead of nested loops
 */
function detectServices(dependencies: Record<string, string>): {
  services: string[];
  confidence: Record<string, number>;
} {
  const detected = new Map<string, number>();

  // Pre-compute lowercase dependency names for faster comparison
  const depNamesLower = Object.keys(dependencies).map(dep => dep.toLowerCase());

  // Single pass: check each dependency against all patterns
  for (const depNameLower of depNamesLower) {
    for (const pattern of SERVICE_PATTERNS) {
      // Check if any pattern matches this dependency
      const hasMatch = pattern.patterns.some(packagePattern =>
        depNameLower.includes(packagePattern.toLowerCase())
      );

      if (hasMatch) {
        // Use highest confidence if multiple matches
        const currentConfidence = detected.get(pattern.name) || 0;
        detected.set(pattern.name, Math.max(currentConfidence, pattern.confidence));
      }
    }
  }

  return {
    services: Array.from(detected.keys()),
    confidence: Object.fromEntries(detected),
  };
}

/**
 * Detect Node.js package manager from package.json
 */
function detectNodePackageManager(packageJson: any): string {
  if (packageJson.packageManager) {
    if (packageJson.packageManager.startsWith("pnpm")) return "pnpm";
    if (packageJson.packageManager.startsWith("yarn")) return "yarn";
    return "npm";
  }

  return "npm"; // Default
}

/**
 * Universal scanner - auto-detect language and scan
 * Optimized: Early exit for empty content, better error handling
 */
export function scanDependencies(
  content: string,
  fileType?: "package.json" | "requirements.txt" | "go.mod" | "Gemfile" | "composer.json" | "Cargo.toml"
): DependencyScanResult {
  // Early exit for empty content
  if (!content || content.trim().length === 0) {
    throw new Error("Cannot scan empty content");
  }

  try {
    // Auto-detect if not specified
    if (!fileType) {
      const trimmed = content.trim();
      if (trimmed.startsWith("{") && content.includes("dependencies")) {
        // Looks like JSON
        const json = JSON.parse(content);
        if (json.dependencies || json.devDependencies) {
          fileType = "package.json";
        } else if (json.require) {
          fileType = "composer.json";
        }
      } else if (content.includes("require (") || content.includes("go ")) {
        fileType = "go.mod";
      } else if (content.includes('gem "') || content.includes("gem '")) {
        fileType = "Gemfile";
      } else if (content.includes("[dependencies]")) {
        fileType = "Cargo.toml";
      } else {
        fileType = "requirements.txt"; // Default to Python
      }
    }

    switch (fileType) {
      case "package.json":
        return scanNodeDependencies(JSON.parse(content));
      case "requirements.txt":
        return scanPythonDependencies(content);
      case "go.mod":
        return scanGoDependencies(content);
      case "Gemfile":
        return scanRubyDependencies(content);
      case "composer.json":
        return scanPHPDependencies(JSON.parse(content));
      case "Cargo.toml":
        return scanRustDependencies(content);
      default:
        throw new Error(`Unsupported file type: ${fileType}`);
    }
  } catch (error) {
    throw new Error(
      `Failed to scan dependencies: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Get recommended scopes for a service
 */
export function getRecommendedScopes(service: string): string[] {
  const pattern = SERVICE_PATTERNS.find((p) => p.name === service);
  return pattern?.scopes || ["read", "write"];
}

/**
 * Get all supported services
 */
export function getSupportedServices(): string[] {
  return SERVICE_PATTERNS.map((p) => p.name).sort();
}
