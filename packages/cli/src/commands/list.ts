import chalk from 'chalk';
import ora from 'ora';
import { ConfigManager } from '../cli/ConfigManager.js';
import { SQLiteSecretStorage } from '../storage/SecretStorage.js';
import { DefaultCryptoProvider } from '../crypto/CryptoProvider.js';

/**
 * List secrets without exposing raw values
 */
export async function listCommand(options: {
  env?: string;
  project?: string;
  tags?: string;
}): Promise<void> {
  const configManager = new ConfigManager();

  // Check if initialized
  if (!(await configManager.exists())) {
    console.log(chalk.red('❌ SecretForge not initialized. Run `sf init` first.'));
    return;
  }

  const config = await configManager.load();
  const spinner = ora('Loading secrets...').start();

  try {
    // Initialize storage
    const cryptoProvider = new DefaultCryptoProvider();
    const storage = new SQLiteSecretStorage(configManager.getDatabasePath(config), cryptoProvider);

    // Parse options
    const listOptions: any = {
      project: options.project || config.project,
    };

    if (options.env) {
      listOptions.environment = options.env;
    }

    if (options.tags) {
      listOptions.tags = options.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
    }

    // List secrets
    const secrets = await storage.listSecrets(listOptions);

    spinner.succeed(`Found ${secrets.length} secret(s)`);

    if (secrets.length === 0) {
      console.log(chalk.yellow('\nNo secrets found.'));
      console.log(chalk.gray('Add a secret with: sf add <NAME>'));
    } else {
      console.log(chalk.bold('\n🔑 Secrets:\n'));

      // Group by environment
      const byEnv = secrets.reduce(
        (acc, secret) => {
          if (!acc[secret.environment]) {
            acc[secret.environment] = [];
          }
          acc[secret.environment].push(secret);
          return acc;
        },
        {} as Record<string, typeof secrets>
      );

      for (const [env, envSecrets] of Object.entries(byEnv)) {
        console.log(chalk.bold.cyan(`  ${env.toUpperCase()}:`));
        envSecrets.forEach((secret) => {
          console.log(chalk.gray(`    • ${secret.name}`));
          console.log(chalk.gray(`      ID: ${secret.id}`));
          if (secret.tags.length > 0) {
            console.log(chalk.gray(`      Tags: ${secret.tags.join(', ')}`));
          }
          console.log(chalk.gray(`      Updated: ${new Date(secret.updated_at).toLocaleString()}`));
          console.log();
        });
      }
    }

    storage.close();
  } catch (error) {
    spinner.fail('Failed to list secrets');
    throw error;
  }
}
