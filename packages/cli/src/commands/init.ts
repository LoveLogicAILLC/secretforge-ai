import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { ConfigManager, assertProjectName, defaultKeyPath } from '../cli/ConfigManager.js';
import { mkdir, access, writeFile, chmod } from 'fs/promises';
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
      filter: (input: string) => input.trim(),
      validate: (input: string) => {
        try {
          assertProjectName(input.trim());
          return true;
        } catch (e) {
          return (e as Error).message;
        }
      },
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
    // Master key: honour SECRETFORGE_ENCRYPTION_KEY if set, otherwise generate a
    // per-project key file (0600) instead of printing the key to the terminal,
    // where it would land in scrollback, shell recordings and CI logs.
    let keyPath: string | undefined;
    if (!process.env.SECRETFORGE_ENCRYPTION_KEY) {
      keyPath = defaultKeyPath(answers.project);
      const keyDir = dirname(keyPath);
      await mkdir(keyDir, { recursive: true, mode: 0o700 });
      let exists = true;
      try {
        await access(keyPath);
      } catch {
        exists = false;
      }
      if (!exists) {
        await writeFile(keyPath, (await generateEncryptionKey()) + '\n', { mode: 0o600, flag: 'wx' });
      }
      if (process.platform !== 'win32') await chmod(keyPath, 0o600);
    }

    const config = await configManager.init(answers.project, answers.environment, keyPath);

    const dbDir = dirname(config.databasePath!);
    await mkdir(dbDir, { recursive: true, mode: 0o700 });

    if (keyPath) {
      spinner.info(`Master key stored at ${chalk.cyan(keyPath)} (mode 600)`);
      console.log(
        chalk.yellow(
          '⚠️  Back this file up somewhere safe (e.g. your password manager). Without it your secrets cannot be decrypted.\n'
        )
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
