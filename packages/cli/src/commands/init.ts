import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { ConfigManager } from '../cli/ConfigManager.js';
import { mkdir, access } from 'fs/promises';
import { dirname } from 'path';
import { generateEncryptionKey } from '../crypto/CryptoProvider.js';

/**
 * Initialize SecretForge in the current project
 */
export async function initCommand(): Promise<void> {
  const configManager = new ConfigManager();

  // Check if already initialized
  if (await configManager.exists()) {
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: 'SecretForge is already initialized. Overwrite?',
        default: false,
      },
    ]);

    if (!overwrite) {
      console.log(chalk.yellow('Initialization cancelled.'));
      return;
    }
  }

  // Gather project information
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'project',
      message: 'Project name:',
      default: process.cwd().split('/').pop() || 'my-project',
      validate: (input: string) => input.trim().length > 0 || 'Project name is required',
    },
    {
      type: 'list',
      name: 'environment',
      message: 'Default environment:',
      choices: ['dev', 'staging', 'prod'],
      default: 'dev',
    },
  ]);

  const spinner = ora('Initializing SecretForge...').start();

  try {
    // Create configuration
    const config = await configManager.init(answers.project, answers.environment);

    // Create database directory
    const dbDir = dirname(config.databasePath!);
    try {
      await access(dbDir);
    } catch {
      await mkdir(dbDir, { recursive: true });
    }

    // Generate encryption key if not exists
    if (!process.env.SECRETFORGE_ENCRYPTION_KEY) {
      const encryptionKey = await generateEncryptionKey();
      spinner.info(
        `Generated encryption key. Add this to your environment:\n\n${chalk.cyan(
          `export SECRETFORGE_ENCRYPTION_KEY="${encryptionKey}"`
        )}\n`
      );
      console.log(
        chalk.yellow('⚠️  Store this key securely! You will need it to decrypt your secrets.\n')
      );
    }

    spinner.succeed('SecretForge initialized successfully!');

    console.log(chalk.bold('\n📋 Configuration:'));
    console.log(chalk.gray(`  Project: ${config.project}`));
    console.log(chalk.gray(`  Default Environment: ${config.defaultEnvironment}`));
    console.log(chalk.gray(`  Database: ${config.databasePath}`));
    console.log(chalk.gray(`  Config: ${configManager['configPath']}`));

    console.log(chalk.bold('\n🚀 Next steps:'));
    console.log(chalk.gray('  1. Add a secret: sf add <NAME>'));
    console.log(chalk.gray('  2. List secrets: sf list'));
    console.log(chalk.gray('  3. Export secrets: sf export --env <file>'));
  } catch (error) {
    spinner.fail('Initialization failed');
    throw error;
  }
}
