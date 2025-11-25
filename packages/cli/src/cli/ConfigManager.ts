import { readFile, writeFile, access } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Configuration for SecretForge
 */
export interface SecretForgeConfig {
  version: string;
  project: string;
  defaultEnvironment: string;
  databasePath?: string;
  encryptionKeyPath?: string;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: SecretForgeConfig = {
  version: '1.0.0',
  project: '',
  defaultEnvironment: 'dev',
};

/**
 * Configuration manager for SecretForge
 */
export class ConfigManager {
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || join(process.cwd(), '.secretforge.json');
  }

  /**
   * Check if configuration exists
   */
  async exists(): Promise<boolean> {
    try {
      await access(this.configPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load configuration
   */
  async load(): Promise<SecretForgeConfig> {
    try {
      const content = await readFile(this.configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to load configuration from ${this.configPath}: ${error}`);
    }
  }

  /**
   * Save configuration
   */
  async save(config: SecretForgeConfig): Promise<void> {
    try {
      await writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
    } catch (error) {
      throw new Error(`Failed to save configuration to ${this.configPath}: ${error}`);
    }
  }

  /**
   * Initialize new configuration
   */
  async init(project: string, environment: string = 'dev'): Promise<SecretForgeConfig> {
    const config: SecretForgeConfig = {
      ...DEFAULT_CONFIG,
      project,
      defaultEnvironment: environment,
      databasePath: join(homedir(), '.secretforge', `${project}.db`),
    };

    await this.save(config);
    return config;
  }

  /**
   * Get the database path
   */
  getDatabasePath(config?: SecretForgeConfig): string {
    if (config?.databasePath) {
      return config.databasePath;
    }
    return join(homedir(), '.secretforge', 'secrets.db');
  }
}
