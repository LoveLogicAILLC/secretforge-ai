import chalk from 'chalk';
import ora from 'ora';
import { ConfigManager } from '../cli/ConfigManager.js';
import { openVault } from '../cli/vault.js';
import { serializeEnvLine, serializeYaml, validateSecretName } from '../format/dotenv.js';
import type { ListSecretsOptions } from '../storage/SecretStorage.js';

/**
 * Export secrets in various formats (to stdout).
 */
export async function exportCommand(options: {
  env?: string;
  format?: 'env' | 'json' | 'yaml';
}): Promise<void> {
  const configManager = new ConfigManager();

  if (!(await configManager.exists())) {
    console.log(chalk.red('❌ SecretForge not initialized. Run `sf init` first.'));
    return;
  }

  const format = options.format || 'env';
  if (!['env', 'json', 'yaml'].includes(format)) {
    throw new Error(`Unknown format "${format}". Use env, json, or yaml.`);
  }

  const config = await configManager.load();
  // Spinner goes to stderr so `sf export > file` captures only the secrets.
  const spinner = ora({ text: 'Exporting secrets...', stream: process.stderr }).start();
  const storage = openVault(configManager, config);

  try {
    const listOptions: ListSecretsOptions = { project: config.project };
    if (options.env) listOptions.environment = options.env;

    const secrets = await storage.listSecrets(listOptions);
    if (secrets.length === 0) {
      spinner.warn('No secrets found to export');
      return;
    }

    const decrypted: Record<string, string> = {};
    for (const secret of secrets) {
      decrypted[secret.name] = await storage.decryptSecret(secret);
    }
    spinner.succeed(`Exported ${secrets.length} secret(s)`);

    switch (format) {
      case 'json':
        console.log(JSON.stringify(decrypted, null, 2));
        break;
      case 'yaml':
        console.log(serializeYaml(decrypted));
        break;
      default:
        for (const [key, value] of Object.entries(decrypted)) {
          if (validateSecretName(key) !== true) {
            console.error(chalk.yellow(`# skipped ${JSON.stringify(key)}: not a valid env var name`));
            continue;
          }
          console.log(serializeEnvLine(key, value));
        }
    }
  } catch (error) {
    spinner.fail('Failed to export secrets');
    throw error;
  } finally {
    storage.close();
  }
}
