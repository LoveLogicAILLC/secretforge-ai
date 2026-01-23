
import { ScanResult, SecretFinding, EnvVarFinding } from "./scanner.js";
import { writeFile } from "fs/promises";
import { join } from "path";

export interface ConsolidatedSecret {
    key: string; // The variable name or guessed type
    value: string;
    sources: string[]; // List of files where this was found
}

export class WiringAgent {
    consolidate(results: ScanResult[]): ConsolidatedSecret[] {
        const map = new Map<string, ConsolidatedSecret>();

        // Process Env Vars first (they have names)
        for (const res of results) {
            for (const env of res.envVars) {
                if (map.has(env.value)) {
                    const existing = map.get(env.value)!;
                    if (!existing.sources.includes(res.file)) {
                        existing.sources.push(res.file);
                    }
                } else {
                    map.set(env.value, {
                        key: env.key,
                        value: env.value,
                        sources: [res.file],
                    });
                }
            }
        }

        // Process raw secrets (trying to deduplicate)
        for (const res of results) {
            for (const secret of res.secrets) {
                if (map.has(secret.value)) {
                    const existing = map.get(secret.value)!;
                    if (!existing.sources.includes(res.file)) {
                        existing.sources.push(res.file);
                    }
                    // If we found a specific type but previously only had a generic one, update it?
                    // For now, assume env vars provide better keys.
                } else {
                    // If we haven't seen this value via an env var, add it as a raw finding
                    // Try to generate a key name based on type
                    const keyName = `DETECTED_${secret.type.toUpperCase()}_KEY`;
                    map.set(secret.value, {
                        key: keyName,
                        value: secret.value,
                        sources: [res.file],
                    });
                }
            }
        }

        return Array.from(map.values());
    }

    async wireToEnvFile(secrets: ConsolidatedSecret[], outputPath: string) {
        const lines = secrets.map(s => `# Sources: ${s.sources.map(p => p.split('/').pop()).join(', ')}\n${s.key}=${s.value}`);
        const content = lines.join("\n\n");
        await writeFile(outputPath, content);
    }

    generateReport(secrets: ConsolidatedSecret[]): string {
        return JSON.stringify(secrets.map(s => ({
            ...s,
            value: s.value.substring(0, 8) + "..." // Mask for report
        })), null, 2);
    }
}
