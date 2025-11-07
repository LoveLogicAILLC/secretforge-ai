import chalk from 'chalk';
import ora from 'ora';
import { ConfigManager } from '../cli/ConfigManager.js';
import { SQLiteSecretStorage } from '../storage/SecretStorage.js';
import { DefaultCryptoProvider } from '../crypto/CryptoProvider.js';

/**
 * Export secrets in various formats
 */
export async function exportCommand(options: {
  env?: string;
  format?: 'env' | 'json' | 'yaml';
}): Promise<void> {
  const configManager = new ConfigManager();

  // Check if initialized
  if (!(await configManager.exists())) {
    console.log(chalk.red('❌ SecretForge not initialized. Run `sf init` first.'));
    return;
  }

  const config = await configManager.load();
  const spinner = ora('Exporting secrets...').start();

  try {
    // Initialize storage
    const cryptoProvider = new DefaultCryptoProvider();
    const storage = new SQLiteSecretStorage(configManager.getDatabasePath(config), cryptoProvider);

    // Get secrets
    const listOptions: any = {
      project: config.project,
    };

    if (options.env) {
      listOptions.environment = options.env;
    }

    const secrets = await storage.listSecrets(listOptions);

    if (secrets.length === 0) {
      spinner.warn('No secrets found to export');
      storage.close();
      return;
    }

    // Decrypt secrets
    const decryptedSecrets: Record<string, string> = {};
    for (const secret of secrets) {
      const value = await storage.decryptSecret(secret);
      decryptedSecrets[secret.name] = value;
    }

    spinner.succeed(`Exported ${secrets.length} secret(s)`);

    const format = options.format || 'env';

    // Format output
    switch (format) {
      case 'json':
        console.log(JSON.stringify(decryptedSecrets, null, 2));
        break;

      case 'yaml':
        console.log('# SecretForge export');
        for (const [key, value] of Object.entries(decryptedSecrets)) {
          // Escape quotes and backslashes for YAML
          const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          console.log(`${key}: "${escaped}"`);
        }
        break;

      case 'env':
      default:
        for (const [key, value] of Object.entries(decryptedSecrets)) {
          // Escape value if needed
          const needsQuotes = /[\s#]/.test(value);
          if (needsQuotes) {
            // Escape quotes and backslashes for shell
            const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            console.log(`${key}="${escaped}"`);
          } else {
            console.log(`${key}=${value}`);
          }
        }
        break;
    }

    storage.close();
  } catch (error) {
    spinner.fail('Failed to export secrets');
    throw error;
  }
}
