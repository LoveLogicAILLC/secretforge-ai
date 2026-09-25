import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { ConfigManager } from '../cli/ConfigManager.js';
import { openVault } from '../cli/vault.js';
import { validateSecretName } from '../format/dotenv.js';

interface AddAnswers {
  name: string;
  value: string;
  environment: string;
  tags: string;
}

/**
 * Add a new secret interactively
 */
export async function addCommand(
  name: string,
  options: { env?: string; tags?: string }
): Promise<void> {
  const configManager = new ConfigManager();

  // Check if initialized
  if (!(await configManager.exists())) {
    console.log(chalk.red('❌ SecretForge not initialized. Run `sf init` first.'));
    return;
  }

  const config = await configManager.load();

  // Gather secret details
  const answers = await inquirer.prompt<AddAnswers>([
    {
      type: 'input',
      name: 'name',
      message: 'Secret name:',
      default: name,
      filter: (input: string) => input.trim(),
      validate: (input: string) =>
        input.trim().length > 0 ? validateSecretName(input.trim()) : 'Secret name is required',
    },
    {
      type: 'password',
      name: 'value',
      message: 'Secret value:',
      mask: '*',
      validate: (input: string) => input.length > 0 || 'Secret value is required',
    },
    {
      type: 'list',
      name: 'environment',
      message: 'Environment:',
      choices: ['dev', 'staging', 'prod'],
      default: options.env || config.defaultEnvironment,
    },
    {
      type: 'input',
      name: 'tags',
      message: 'Tags (comma-separated):',
      default: options.tags || '',
    },
  ] as any);

  const spinner = ora('Adding secret...').start();

  try {
    // Initialize storage
    const storage = openVault(configManager, config);

    // Check if secret already exists
    const existing = await storage.getSecretByName(
      answers.name,
      config.project,
      answers.environment
    );

    if (existing) {
      spinner.stop();
      const { overwrite } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: `Secret "${answers.name}" already exists in ${answers.environment}. Overwrite?`,
          default: false,
        },
      ]);

      if (!overwrite) {
        console.log(chalk.yellow('Cancelled.'));
        storage.close();
        return;
      }

      spinner.start('Updating secret...');
      await storage.updateSecret(existing.id, answers.value);
      spinner.succeed('Secret updated successfully!');
    } else {
      // Parse tags
      const tags = answers.tags
        ? answers.tags
            .split(',')
            .map((t: string) => t.trim())
            .filter(Boolean)
        : [];

      // Add new secret
      const secret = await storage.addSecret({
        name: answers.name,
        value: answers.value,
        project: config.project,
        environment: answers.environment,
        tags,
      });

      spinner.succeed('Secret added successfully!');

      console.log(chalk.bold('\n📋 Secret Details:'));
      console.log(chalk.gray(`  ID: ${secret.id}`));
      console.log(chalk.gray(`  Name: ${secret.name}`));
      console.log(chalk.gray(`  Environment: ${secret.environment}`));
      if (tags.length > 0) {
        console.log(chalk.gray(`  Tags: ${tags.join(', ')}`));
      }
    }

    storage.close();
  } catch (error) {
    spinner.fail('Failed to add secret');
    throw error;
  }
}
