import { CryptoProvider } from '../crypto/CryptoProvider.js';

/**
 * Secret metadata and encrypted value
 */
export interface Secret {
  id: string;
  name: string;
  project: string;
  environment: string;
  tags: string[];
  value_encrypted: string;
  created_at: string;
  updated_at: string;
}

/**
 * Options for adding a new secret
 */
export interface AddSecretOptions {
  name: string;
  value: string;
  project: string;
  environment: string;
  tags?: string[];
}

/**
 * Options for listing secrets
 */
export interface ListSecretsOptions {
  project?: string;
  environment?: string;
  tags?: string[];
}

/**
 * Storage interface for managing secrets
 */
export interface SecretStorage {
  /**
   * Add a new secret
   */
  addSecret(options: AddSecretOptions): Promise<Secret>;

  /**
   * Get a secret by ID
   */
  getSecret(id: string): Promise<Secret | null>;

  /**
   * Get a secret by name, project, and environment
   */
  getSecretByName(name: string, project: string, environment: string): Promise<Secret | null>;

  /**
   * List secrets with optional filters
   */
  listSecrets(options?: ListSecretsOptions): Promise<Secret[]>;

  /**
   * Update a secret's value
   */
  updateSecret(id: string, value: string): Promise<Secret>;

  /**
   * Delete a secret
   */
  deleteSecret(id: string): Promise<void>;

  /**
   * Decrypt a secret's value
   */
  decryptSecret(secret: Secret): Promise<string>;
}

/**
 * SQLite-based secret storage implementation
 */
export class SQLiteSecretStorage implements SecretStorage {
  private db: any;
  private cryptoProvider: CryptoProvider;

  constructor(dbPath: string, cryptoProvider: CryptoProvider) {
    this.cryptoProvider = cryptoProvider;
    const Database = require('better-sqlite3');
    this.db = new Database(dbPath);
    this.initDatabase();
  }

  private initDatabase(): void {
    // Create secrets table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS secrets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        project TEXT NOT NULL,
        environment TEXT NOT NULL,
        tags TEXT NOT NULL,
        value_encrypted TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(name, project, environment)
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_project_env ON secrets(project, environment);
      CREATE INDEX IF NOT EXISTS idx_name ON secrets(name);
    `);
  }

  async addSecret(options: AddSecretOptions): Promise<Secret> {
    const { name, value, project, environment, tags = [] } = options;

    // Encrypt the value
    const value_encrypted = await this.cryptoProvider.encrypt(value);

    // Generate ID and timestamps
    const id = this.generateId();
    const now = new Date().toISOString();

    const secret: Secret = {
      id,
      name,
      project,
      environment,
      tags,
      value_encrypted,
      created_at: now,
      updated_at: now,
    };

    // Insert into database
    const stmt = this.db.prepare(`
      INSERT INTO secrets (id, name, project, environment, tags, value_encrypted, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      secret.id,
      secret.name,
      secret.project,
      secret.environment,
      JSON.stringify(secret.tags),
      secret.value_encrypted,
      secret.created_at,
      secret.updated_at
    );

    return secret;
  }

  async getSecret(id: string): Promise<Secret | null> {
    const stmt = this.db.prepare('SELECT * FROM secrets WHERE id = ?');
    const row = stmt.get(id);

    if (!row) {
      return null;
    }

    return this.rowToSecret(row);
  }

  async getSecretByName(name: string, project: string, environment: string): Promise<Secret | null> {
    const stmt = this.db.prepare(
      'SELECT * FROM secrets WHERE name = ? AND project = ? AND environment = ?'
    );
    const row = stmt.get(name, project, environment);

    if (!row) {
      return null;
    }

    return this.rowToSecret(row);
  }

  async listSecrets(options: ListSecretsOptions = {}): Promise<Secret[]> {
    let query = 'SELECT * FROM secrets WHERE 1=1';
    const params: any[] = [];

    if (options.project) {
      query += ' AND project = ?';
      params.push(options.project);
    }

    if (options.environment) {
      query += ' AND environment = ?';
      params.push(options.environment);
    }

    query += ' ORDER BY created_at DESC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params);

    const secrets = rows.map((row: any) => this.rowToSecret(row));

    // Filter by tags if provided
    if (options.tags && options.tags.length > 0) {
      return secrets.filter((secret: Secret) =>
        options.tags!.some((tag) => secret.tags.includes(tag))
      );
    }

    return secrets;
  }

  async updateSecret(id: string, value: string): Promise<Secret> {
    const value_encrypted = await this.cryptoProvider.encrypt(value);
    const updated_at = new Date().toISOString();

    const stmt = this.db.prepare(`
      UPDATE secrets SET value_encrypted = ?, updated_at = ? WHERE id = ?
    `);

    stmt.run(value_encrypted, updated_at, id);

    const secret = await this.getSecret(id);
    if (!secret) {
      throw new Error(`Secret ${id} not found after update`);
    }

    return secret;
  }

  async deleteSecret(id: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM secrets WHERE id = ?');
    stmt.run(id);
  }

  async decryptSecret(secret: Secret): Promise<string> {
    return this.cryptoProvider.decrypt(secret.value_encrypted);
  }

  private rowToSecret(row: any): Secret {
    return {
      id: row.id,
      name: row.name,
      project: row.project,
      environment: row.environment,
      tags: JSON.parse(row.tags),
      value_encrypted: row.value_encrypted,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private generateId(): string {
    return `sec_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  close(): void {
    if (this.db) {
      this.db.close();
    }
  }
}
