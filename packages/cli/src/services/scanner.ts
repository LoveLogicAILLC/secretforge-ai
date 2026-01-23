
import glob from "fast-glob";
import { readFile } from "fs/promises";
import { join } from "path";

export interface ScanResult {
  file: string;
  secrets: SecretFinding[];
  envVars: EnvVarFinding[];
}

export interface SecretFinding {
  type: string;
  value: string;
  line: number;
}

export interface EnvVarFinding {
  key: string;
  value: string;
  line: number;
}

export class DepartmentScanner {
  private secretPatterns: Record<string, RegExp> = {
    stripe: /(?:sk|pk)_(?:test|live)_[0-9a-zA-Z]{24,}/,
    openai: /sk-[0-9a-zA-Z]{48}/,
    anthropic: /sk-ant-[0-9a-zA-Z]{48,}/,
    awsAccessex: /AKIA[0-9A-Z]{16}/,
    generic: /(?:api_key|token|secret|password)[\s=:>]{1,3}['"]?([0-9a-zA-Z\-_]{16,})['"]?/i,
  };

  async scanDirectory(path: string, options: { recursive?: boolean } = {}): Promise<ScanResult[]> {
    const findings: ScanResult[] = [];
    const files = await glob("**/*", {
      cwd: path,
      ignore: ["**/node_modules/**", "**/.git/**", "**/*.lock"],
      absolute: true,
      onlyFiles: true,
      deep: options.recursive !== false ? undefined : 1,
    });

    for (const file of files) {
      try {
        const content = await readFile(file, "utf-8");
        const result = await this.scanFile(file, content);
        if (result.secrets.length > 0 || result.envVars.length > 0) {
          findings.push(result);
        }
      } catch (error) {
        // Skip binary files or read errors
        continue;
      }
    }

    return findings;
  }

  async scanFile(filePath: string, content: string): Promise<ScanResult> {
    const secrets: SecretFinding[] = [];
    const envVars: EnvVarFinding[] = [];
    const lines = content.split("\n");

    const isEnvFile = filePath.endsWith(".env") || filePath.includes(".env.");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Env specific parsing
      if (isEnvFile) {
        const envMatch = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (envMatch) {
          envVars.push({
            key: envMatch[1],
            value: envMatch[2].trim(),
            line: lineNumber,
          });
          
          // Check the value for secrets even in env files
          this.checkSecrets(envMatch[2], secrets, lineNumber);
        }
      } else {
        // General secret scanning
        this.checkSecrets(line, secrets, lineNumber);
      }
    }

    return { file: filePath, secrets, envVars };
  }

  private checkSecrets(text: string, secrets: SecretFinding[], line: number) {
    for (const [type, pattern] of Object.entries(this.secretPatterns)) {
      const match = text.match(pattern);
      if (match) {
        // For generic matches, the secret is in the first capture group if present, otherwise the whole match
        const value = match[1] || match[0];
        
        // Basic false positive filter for generic
        if (type === 'generic') {
           if (value.length < 10 || value.includes(' ')) continue;
        }

        secrets.push({
          type,
          value,
          line,
        });
      }
    }
  }
}
