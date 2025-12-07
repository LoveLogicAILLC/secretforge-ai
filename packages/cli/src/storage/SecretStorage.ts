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
 * Optimized: Cached prepared statements for better performance
 */
export class SQLiteSecretStorage implements SecretStorage {
  private db: any;
  private cryptoProvider: CryptoProvider;
  private preparedStatements: Map<string, any>; // Cache for prepared statements

  constructor(dbPath: string, cryptoProvider: CryptoProvider) {
    this.cryptoProvider = cryptoProvider;
    this.preparedStatements = new Map();
    this.initDatabase(dbPath);
  }

  private initDatabase(dbPath: string): void {
    // Use dynamic import for ES module compatibility
    const Database = require('better-sqlite3');
    this.db = new Database(dbPath);
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

  /**
   * Get or create a prepared statement (cached)
   */
  private getPreparedStatement(key: string, sql: string): any {
    if (!this.preparedStatements.has(key)) {
      this.preparedStatements.set(key, this.db.prepare(sql));
    }
    return this.preparedStatements.get(key);
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

    // Use cached prepared statement
    const stmt = this.getPreparedStatement(
      'insert_secret',
      `INSERT INTO secrets (id, name, project, environment, tags, value_encrypted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

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
    const stmt = this.getPreparedStatement(
      'get_secret',
      'SELECT * FROM secrets WHERE id = ?'
    );
    const row = stmt.get(id);

    if (!row) {
      return null;
    }

    return this.rowToSecret(row);
  }

  async getSecretByName(name: string, project: string, environment: string): Promise<Secret | null> {
    const stmt = this.getPreparedStatement(
      'get_secret_by_name',
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

    // Optimize tag filtering using SQL JSON functions
    // Note: SQLite JSON support varies. Using more precise LIKE pattern to avoid partial matches
    if (options.tags && options.tags.length > 0) {
      // Build SQL to check if any of the requested tags exist in the JSON array
      // Using pattern: ["tag"] or ,"tag", or ,"tag"] to ensure exact match
      const tagConditions = options.tags.map(() => 
        `(tags LIKE ? OR tags LIKE ? OR tags LIKE ?)`
      ).join(' OR ');
      query += ` AND (${tagConditions})`;
      // Add patterns for: start of array, middle of array, end of array
      options.tags.forEach(tag => {
        params.push(`["${tag}"%`);  // Start of array: ["tag"
        params.push(`%,"${tag}",%`); // Middle: ,"tag",
        params.push(`%,"${tag}"]`);  // End: ,"tag"]
      });
    }

    query += ' ORDER BY created_at DESC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params);

    return rows.map((row: any) => this.rowToSecret(row));
  }

  async updateSecret(id: string, value: string): Promise<Secret> {
    const value_encrypted = await this.cryptoProvider.encrypt(value);
    const updated_at = new Date().toISOString();

    const stmt = this.getPreparedStatement(
      'update_secret',
      'UPDATE secrets SET value_encrypted = ?, updated_at = ? WHERE id = ?'
    );

    stmt.run(value_encrypted, updated_at, id);

    const secret = await this.getSecret(id);
    if (!secret) {
      throw new Error(`Secret ${id} not found after update`);
    }

    return secret;
  }

  async deleteSecret(id: string): Promise<void> {
    const stmt = this.getPreparedStatement(
      'delete_secret',
      'DELETE FROM secrets WHERE id = ?'
    );
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
    // Use crypto.randomUUID() for cryptographically secure IDs
    const crypto = require('crypto');
    return `sec_${crypto.randomUUID().replace(/-/g, '')}`;
  }

  close(): void {
    if (this.db) {
      // Clear prepared statements cache
      this.preparedStatements.clear();
      this.db.close();
    }
  }
}
