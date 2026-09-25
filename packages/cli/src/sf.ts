#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init.js';
import { addCommand } from './commands/add.js';
import { listCommand } from './commands/list.js';
import { injectCommand } from './commands/inject.js';
import { exportCommand } from './commands/export.js';
import { scanCommand, CLI_VERSION } from './commands/scan.js';
import { hookCommand } from './commands/hook.js';

const program = new Command();

program.name('sf').description('SecretForge - AI-powered secret management CLI').version(CLI_VERSION);

// sf init - Initialize project
program
  .command('init')
  .description('Initialize SecretForge in current project and create .secretforge.json config')
  .action(async () => {
    try {
      await initCommand();
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
      process.exit(1);
    }
  });

// sf add <NAME> - Add secret interactively
program
  .command('add [name]')
  .description('Interactive secret addition with encryption')
  .option('-e, --env <environment>', 'Environment (dev/staging/prod)')
  .option('-t, --tags <tags>', 'Comma-separated tags')
  .action(async (name: string | undefined, options) => {
    try {
      await addCommand(name || '', options);
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
      process.exit(1);
    }
  });

// sf list - List secrets
program
  .command('list')
  .description('List secrets without exposing raw values')
  .option('-e, --env <environment>', 'Filter by environment')
  .option('-p, --project <project>', 'Filter by project')
  .option('-t, --tags <tags>', 'Filter by tags (comma-separated)')
  .action(async (options) => {
    try {
      await listCommand(options);
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
      process.exit(1);
    }
  });

// sf inject - Inject secrets into env file
program
  .command('inject')
  .description('Inject encrypted secrets into target files')
  .requiredOption('-e, --env <environment>', 'Environment to inject')
  .option('-f, --file <file>', 'Output file (default: .env.<environment>)')
  .option('--force', 'Write even if the target file is tracked by git')
  .action(async (options) => {
    try {
      await injectCommand(options);
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
      process.exit(1);
    }
  });

// sf export - Export secrets
program
  .command('export')
  .description('Export secrets in various formats')
  .option('-e, --env <environment>', 'Filter by environment')
  .option('-f, --format <format>', 'Output format: env (default), json, yaml', 'env')
  .action(async (options) => {
    try {
      await exportCommand(options);
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
      process.exit(1);
    }
  });

// sf scan - Detect leaked secrets
program
  .command('scan')
  .description('Scan the working tree, staged changes, or git history for leaked secrets')
  .option('--staged', 'Scan only lines added in the git index (use in pre-commit)')
  .option('--history', 'Scan every line ever added on any branch')
  .option('--since <date>', 'With --history: only commits since this date (e.g. "3 months ago")')
  .option('-p, --path <dir>', 'Directory to scan (default: current directory)')
  .option('-f, --format <format>', 'pretty (default), json, or sarif', 'pretty')
  .option('-o, --output <file>', 'Write the report to a file')
  .option('-b, --baseline <file>', 'Baseline of accepted findings', '.secretforge-baseline.json')
  .option('--update-baseline', 'Accept all current findings into the baseline')
  .option('--fail-on <severity>', 'Exit 1 at/above: critical, high, medium, low, none', 'high')
  .option('--min-confidence <n>', 'Drop findings below this confidence (0-1)', '0.5')
  .action(async (options) => {
    try {
      const { exitCode } = await scanCommand(options);
      process.exitCode = exitCode;
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
      process.exitCode = 2;
    }
  });

// sf hook - Manage the git pre-commit hook
program
  .command('hook')
  .argument('<action>', 'install | uninstall')
  .description('Install a pre-commit hook that blocks commits containing secrets')
  .option('--fail-on <severity>', 'Minimum severity that blocks a commit', 'high')
  .action(async (action, options) => {
    try {
      await hookCommand(action, options);
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : error}`));
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();
