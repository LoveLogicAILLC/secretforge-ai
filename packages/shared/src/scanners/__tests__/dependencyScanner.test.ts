import { describe, it, expect } from "vitest";
import {
  scanNodeDependencies,
  scanPythonDependencies,
  scanGoDependencies,
  scanRubyDependencies,
  scanPHPDependencies,
  scanRustDependencies,
  scanDependencies,
  getRecommendedScopes,
  getSupportedServices,
} from "../dependencyScanner";

describe("Node.js Dependency Scanner", () => {
  it("should detect Stripe from package.json", () => {
    const packageJson = {
      dependencies: {
        stripe: "^12.0.0",
      },
    };

    const result = scanNodeDependencies(packageJson);

    expect(result.services).toContain("stripe");
    expect(result.confidence.stripe).toBeGreaterThan(0.9);
    expect(result.language).toBe("javascript");
    expect(result.packageManager).toBe("npm");
  });

  it("should detect multiple services", () => {
    const packageJson = {
      dependencies: {
        stripe: "^12.0.0",
        openai: "^4.0.0",
        "@supabase/supabase-js": "^2.0.0",
      },
      devDependencies: {
        "@sendgrid/mail": "^7.0.0",
      },
    };

    const result = scanNodeDependencies(packageJson);

    expect(result.services).toContain("stripe");
    expect(result.services).toContain("openai");
    expect(result.services).toContain("supabase");
    expect(result.services).toContain("sendgrid");
    expect(result.services.length).toBe(4);
  });

  it("should detect AWS SDK scoped packages", () => {
    const packageJson = {
      dependencies: {
        "@aws-sdk/client-s3": "^3.0.0",
        "@aws-sdk/client-lambda": "^3.0.0",
      },
    };

    const result = scanNodeDependencies(packageJson);

    expect(result.services).toContain("aws");
  });

  it("should detect pnpm from packageManager field", () => {
    const packageJson = {
      packageManager: "pnpm@8.0.0",
      dependencies: {
        stripe: "^12.0.0",
      },
    };

    const result = scanNodeDependencies(packageJson);

    expect(result.packageManager).toBe("pnpm");
  });
});

describe("Python Dependency Scanner", () => {
  it("should parse requirements.txt", () => {
    const requirements = `
stripe==5.0.0
openai>=1.0.0
psycopg2-binary
# Comment line
redis~=4.0.0
    `.trim();

    const result = scanPythonDependencies(requirements);

    expect(result.services).toContain("stripe");
    expect(result.services).toContain("openai");
    expect(result.services).toContain("postgresql");
    expect(result.services).toContain("redis");
    expect(result.language).toBe("python");
    expect(result.packageManager).toBe("pip");
  });

  it("should handle empty lines and comments", () => {
    const requirements = `
# This is a comment

stripe==5.0.0

openai>=1.0.0
    `.trim();

    const result = scanPythonDependencies(requirements);

    expect(result.services).toContain("stripe");
    expect(result.services).toContain("openai");
  });
});

describe("Go Dependency Scanner", () => {
  it("should parse go.mod file", () => {
    const goMod = `
module myapp

go 1.20

require (
    github.com/stripe/stripe-go v74.0.0
    github.com/twilio/twilio-go v1.0.0
)

require github.com/redis/go-redis v9.0.0
    `.trim();

    const result = scanGoDependencies(goMod);

    expect(result.services).toContain("stripe");
    expect(result.services).toContain("twilio");
    expect(result.services).toContain("redis");
    expect(result.language).toBe("go");
    expect(result.packageManager).toBe("go");
  });
});

describe("Ruby Dependency Scanner", () => {
  it("should parse Gemfile", () => {
    const gemfile = `
source "https://rubygems.org"

gem "stripe", "~> 8.0"
gem "twilio-ruby", "5.0.0"
gem 'redis', '~> 4.0'
# Comment
gem "pg"
    `.trim();

    const result = scanRubyDependencies(gemfile);

    expect(result.services).toContain("stripe");
    expect(result.services).toContain("twilio");
    expect(result.services).toContain("redis");
    expect(result.services).toContain("postgresql");
    expect(result.language).toBe("ruby");
    expect(result.packageManager).toBe("bundler");
  });
});

describe("PHP Dependency Scanner", () => {
  it("should parse composer.json", () => {
    const composerJson = {
      require: {
        "stripe/stripe-php": "^10.0",
        "twilio/sdk": "^6.0",
      },
      "require-dev": {
        "mongodb/mongodb": "^1.0",
      },
    };

    const result = scanPHPDependencies(composerJson);

    expect(result.services).toContain("stripe");
    expect(result.services).toContain("twilio");
    expect(result.services).toContain("mongodb");
    expect(result.language).toBe("php");
    expect(result.packageManager).toBe("composer");
  });
});

describe("Rust Dependency Scanner", () => {
  it("should parse Cargo.toml", () => {
    const cargoToml = `
[package]
name = "myapp"
version = "0.1.0"

[dependencies]
stripe-rust = "0.1.0"
redis = "0.23.0"
mongodb = "2.0.0"

[dev-dependencies]
tokio = "1.0"
    `.trim();

    const result = scanRustDependencies(cargoToml);

    expect(result.services).toContain("stripe");
    expect(result.services).toContain("redis");
    expect(result.services).toContain("mongodb");
    expect(result.language).toBe("rust");
    expect(result.packageManager).toBe("cargo");
  });
});

describe("Universal Scanner", () => {
  it("should auto-detect package.json", () => {
    const content = JSON.stringify({
      dependencies: {
        stripe: "^12.0.0",
      },
    });

    const result = scanDependencies(content);

    expect(result.services).toContain("stripe");
    expect(result.language).toBe("javascript");
  });

  it("should auto-detect go.mod", () => {
    const content = `
module myapp

require (
    github.com/stripe/stripe-go v74.0.0
)
    `.trim();

    const result = scanDependencies(content);

    expect(result.services).toContain("stripe");
    expect(result.language).toBe("go");
  });

  it("should use explicit file type", () => {
    const content = "stripe==5.0.0";

    const result = scanDependencies(content, "requirements.txt");

    expect(result.services).toContain("stripe");
    expect(result.language).toBe("python");
  });
});

describe("Recommended Scopes", () => {
  it("should return recommended scopes for Stripe", () => {
    const scopes = getRecommendedScopes("stripe");

    expect(scopes).toContain("read");
    expect(scopes).toContain("write");
  });

  it("should return recommended scopes for AWS", () => {
    const scopes = getRecommendedScopes("aws");

    expect(scopes.length).toBeGreaterThan(0);
  });

  it("should return default scopes for unknown service", () => {
    const scopes = getRecommendedScopes("unknown-service");

    expect(scopes).toEqual(["read", "write"]);
  });
});

describe("Supported Services", () => {
  it("should return list of all supported services", () => {
    const services = getSupportedServices();

    expect(services).toContain("stripe");
    expect(services).toContain("openai");
    expect(services).toContain("aws");
    expect(services).toContain("twilio");
    expect(services.length).toBeGreaterThan(20);
  });

  it("should return sorted list", () => {
    const services = getSupportedServices();

    const sorted = [...services].sort();
    expect(services).toEqual(sorted);
  });
});

describe("Confidence Scores", () => {
  it("should assign high confidence to exact matches", () => {
    const packageJson = {
      dependencies: {
        stripe: "^12.0.0",
      },
    };

    const result = scanNodeDependencies(packageJson);

    expect(result.confidence.stripe).toBeGreaterThan(0.95);
  });

  it("should handle multiple matches with max confidence", () => {
    const packageJson = {
      dependencies: {
        stripe: "^12.0.0",
        "@stripe/stripe-js": "^1.0.0",
      },
    };

    const result = scanNodeDependencies(packageJson);

    expect(result.services.filter((s) => s === "stripe").length).toBe(1);
    expect(result.confidence.stripe).toBeGreaterThan(0.95);
  });
});
