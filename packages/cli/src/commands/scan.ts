
import { Command } from "commander";
import ora from "ora";
import chalk from "chalk";
import { DepartmentScanner } from "../services/scanner.js";
import { WiringAgent } from "../services/wiring.js";
import { resolve } from "path";

export const scanCommand = new Command("scan")
    .description("Autonomous scan for secrets and environment variables")
    .argument("[path]", "Path to scan", ".")
    .option("-w, --wire <file>", "Wire found secrets to an output .env file")
    .option("-r, --recursive", "Scan recursively", true)
    .option("--no-recursive", "Disable recursive scan")
    .action(async (path, options) => {
        const spinner = ora("Initializing Autonomous Scanner...").start();
        const targetPath = resolve(process.cwd(), path);

        try {
            const scanner = new DepartmentScanner();
            const wiring = new WiringAgent();

            spinner.text = `Scanning directory: ${targetPath}`;
            const findings = await scanner.scanDirectory(targetPath, {
                recursive: options.recursive
            });

            if (findings.length === 0) {
                spinner.succeed("Scan complete. No secrets found.");
                return;
            }

            const consolidated = wiring.consolidate(findings);
            spinner.succeed(`Scan complete. Found ${consolidated.length} unique secrets.`);

            console.log(chalk.bold("\n🕵️  Autonomous Findings:\n"));

            consolidated.forEach(secret => {
                console.log(chalk.blue(`• ${secret.key}`));
                console.log(`  Value: ${chalk.gray(secret.value.substring(0, 10))}...`);
                console.log(`  Sources:`);
                secret.sources.forEach(s => console.log(`    - ${chalk.dim(s)}`));
                console.log("");
            });

            if (options.wire) {
                const wirePath = resolve(process.cwd(), options.wire);
                await wiring.wireToEnvFile(consolidated, wirePath);
                console.log(chalk.green(`\n✅ Wired ${consolidated.length} secrets to ${wirePath}`));
            }

        } catch (error) {
            spinner.fail("Scan failed");
            console.error(error);
            process.exit(1);
        }
    });
