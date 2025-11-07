import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteSecretStorage } from '../storage/SecretStorage';
import { DefaultCryptoProvider, generateEncryptionKey } from '../crypto/CryptoProvider';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlink } from 'fs/promises';

describe('SecretStorage', () => {
  let storage: SQLiteSecretStorage;
  let cryptoProvider: DefaultCryptoProvider;
  let dbPath: string;

  beforeEach(async () => {
    const encryptionKey = generateEncryptionKey();
    cryptoProvider = new DefaultCryptoProvider(encryptionKey);
    dbPath = join(tmpdir(), `test-secrets-${Date.now()}.db`);
    storage = new SQLiteSecretStorage(dbPath, cryptoProvider);
  });

  afterEach(async () => {
    storage.close();
    try {
      await unlink(dbPath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  describe('addSecret', () => {
    it('should add a new secret', async () => {
      const secret = await storage.addSecret({
        name: 'API_KEY',
        value: 'secret-value',
        project: 'test-project',
        environment: 'dev',
        tags: ['api', 'external'],
      });

      expect(secret.id).toBeTruthy();
      expect(secret.name).toBe('API_KEY');
      expect(secret.project).toBe('test-project');
      expect(secret.environment).toBe('dev');
      expect(secret.tags).toEqual(['api', 'external']);
      expect(secret.value_encrypted).toBeTruthy();
      expect(secret.created_at).toBeTruthy();
      expect(secret.updated_at).toBeTruthy();
    });

    it('should encrypt the secret value', async () => {
      const secret = await storage.addSecret({
        name: 'API_KEY',
        value: 'secret-value',
        project: 'test-project',
        environment: 'dev',
      });

      expect(secret.value_encrypted).not.toBe('secret-value');
      
      const decrypted = await storage.decryptSecret(secret);
      expect(decrypted).toBe('secret-value');
    });

    it('should handle secrets without tags', async () => {
      const secret = await storage.addSecret({
        name: 'API_KEY',
        value: 'secret-value',
        project: 'test-project',
        environment: 'dev',
      });

      expect(secret.tags).toEqual([]);
    });

    it('should enforce unique constraint on name, project, environment', async () => {
      await storage.addSecret({
        name: 'API_KEY',
        value: 'secret-value-1',
        project: 'test-project',
        environment: 'dev',
      });

      await expect(
        storage.addSecret({
          name: 'API_KEY',
          value: 'secret-value-2',
          project: 'test-project',
          environment: 'dev',
        })
      ).rejects.toThrow();
    });

    it('should allow same name in different environments', async () => {
      const secret1 = await storage.addSecret({
        name: 'API_KEY',
        value: 'dev-value',
        project: 'test-project',
        environment: 'dev',
      });

      const secret2 = await storage.addSecret({
        name: 'API_KEY',
        value: 'prod-value',
        project: 'test-project',
        environment: 'prod',
      });

      expect(secret1.id).not.toBe(secret2.id);
      expect(await storage.decryptSecret(secret1)).toBe('dev-value');
      expect(await storage.decryptSecret(secret2)).toBe('prod-value');
    });
  });

  describe('getSecret', () => {
    it('should retrieve a secret by ID', async () => {
      const added = await storage.addSecret({
        name: 'API_KEY',
        value: 'secret-value',
        project: 'test-project',
        environment: 'dev',
      });

      const retrieved = await storage.getSecret(added.id);
      expect(retrieved).toBeTruthy();
      expect(retrieved!.id).toBe(added.id);
      expect(retrieved!.name).toBe('API_KEY');
    });

    it('should return null for non-existent ID', async () => {
      const secret = await storage.getSecret('non-existent-id');
      expect(secret).toBeNull();
    });
  });

  describe('getSecretByName', () => {
    it('should retrieve a secret by name, project, and environment', async () => {
      await storage.addSecret({
        name: 'API_KEY',
        value: 'secret-value',
        project: 'test-project',
        environment: 'dev',
      });

      const secret = await storage.getSecretByName('API_KEY', 'test-project', 'dev');
      expect(secret).toBeTruthy();
      expect(secret!.name).toBe('API_KEY');
      expect(secret!.project).toBe('test-project');
      expect(secret!.environment).toBe('dev');
    });

    it('should return null if not found', async () => {
      const secret = await storage.getSecretByName('API_KEY', 'test-project', 'dev');
      expect(secret).toBeNull();
    });
  });

  describe('listSecrets', () => {
    beforeEach(async () => {
      await storage.addSecret({
        name: 'API_KEY_1',
        value: 'value1',
        project: 'project-a',
        environment: 'dev',
        tags: ['api'],
      });

      await storage.addSecret({
        name: 'API_KEY_2',
        value: 'value2',
        project: 'project-a',
        environment: 'prod',
        tags: ['api', 'critical'],
      });

      await storage.addSecret({
        name: 'DB_PASSWORD',
        value: 'value3',
        project: 'project-b',
        environment: 'dev',
        tags: ['database'],
      });
    });

    it('should list all secrets', async () => {
      const secrets = await storage.listSecrets();
      expect(secrets.length).toBe(3);
    });

    it('should filter by project', async () => {
      const secrets = await storage.listSecrets({ project: 'project-a' });
      expect(secrets.length).toBe(2);
      expect(secrets.every((s) => s.project === 'project-a')).toBe(true);
    });

    it('should filter by environment', async () => {
      const secrets = await storage.listSecrets({ environment: 'dev' });
      expect(secrets.length).toBe(2);
      expect(secrets.every((s) => s.environment === 'dev')).toBe(true);
    });

    it('should filter by project and environment', async () => {
      const secrets = await storage.listSecrets({
        project: 'project-a',
        environment: 'prod',
      });
      expect(secrets.length).toBe(1);
      expect(secrets[0].name).toBe('API_KEY_2');
    });

    it('should filter by tags', async () => {
      const secrets = await storage.listSecrets({ tags: ['critical'] });
      expect(secrets.length).toBe(1);
      expect(secrets[0].name).toBe('API_KEY_2');
    });

    it('should return empty array when no matches', async () => {
      const secrets = await storage.listSecrets({ project: 'non-existent' });
      expect(secrets.length).toBe(0);
    });
  });

  describe('updateSecret', () => {
    it('should update a secret value', async () => {
      const secret = await storage.addSecret({
        name: 'API_KEY',
        value: 'old-value',
        project: 'test-project',
        environment: 'dev',
      });

      const updated = await storage.updateSecret(secret.id, 'new-value');
      
      expect(updated.id).toBe(secret.id);
      expect(updated.updated_at).not.toBe(secret.updated_at);
      
      const decrypted = await storage.decryptSecret(updated);
      expect(decrypted).toBe('new-value');
    });

    it('should throw if secret not found', async () => {
      await expect(storage.updateSecret('non-existent-id', 'new-value')).rejects.toThrow();
    });
  });

  describe('deleteSecret', () => {
    it('should delete a secret', async () => {
      const secret = await storage.addSecret({
        name: 'API_KEY',
        value: 'secret-value',
        project: 'test-project',
        environment: 'dev',
      });

      await storage.deleteSecret(secret.id);

      const retrieved = await storage.getSecret(secret.id);
      expect(retrieved).toBeNull();
    });

    it('should not throw if secret does not exist', async () => {
      await expect(storage.deleteSecret('non-existent-id')).resolves.not.toThrow();
    });
  });

  describe('decryptSecret', () => {
    it('should decrypt a secret value', async () => {
      const secret = await storage.addSecret({
        name: 'API_KEY',
        value: 'secret-value',
        project: 'test-project',
        environment: 'dev',
      });

      const decrypted = await storage.decryptSecret(secret);
      expect(decrypted).toBe('secret-value');
    });
  });
});
