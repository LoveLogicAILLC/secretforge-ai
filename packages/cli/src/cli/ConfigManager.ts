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
 * Project names become file names under ~/.secretforge, so they must not be able
 * to contain path separators or `..` (e.g. a project named "../../.ssh/x").
 */
export function assertProjectName(project: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(project) || project.includes('..')) {
    throw new Error(
      'Project name may only contain letters, digits, ".", "_" and "-" (and must start with a letter or digit)'
    );
  }
}

/** Default location for a project's master key file. */
export function defaultKeyPath(project: string): string {
  assertProjectName(project);
  return join(homedir(), '.secretforge', 'keys', `${project}.key`);
}

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
      const config = JSON.parse(content) as SecretForgeConfig;
      assertProjectName(config.project);
      return config;
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
  async init(
    project: string,
    environment: string = 'dev',
    encryptionKeyPath?: string
  ): Promise<SecretForgeConfig> {
    assertProjectName(project);
    const config: SecretForgeConfig = {
      ...DEFAULT_CONFIG,
      project,
      defaultEnvironment: environment,
      databasePath: join(homedir(), '.secretforge', `${project}.db`),
      ...(encryptionKeyPath ? { encryptionKeyPath } : {}),
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
