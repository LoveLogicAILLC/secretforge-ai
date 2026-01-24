#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init.js';
import { addCommand } from './commands/add.js';
import { listCommand } from './commands/list.js';
import { injectCommand } from './commands/inject.js';
import { exportCommand } from './commands/export.js';

const program = new Command();

program.name('sf').description('SecretForge - AI-powered secret management CLI').version('1.0.0');

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

// Parse command line arguments
program.parse();
