import { execFileSync } from 'node:child_process';
import { chmod, open } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { ConfigManager, SecretForgeConfig } from './ConfigManager.js';
import { DefaultCryptoProvider } from '../crypto/CryptoProvider.js';
import { SQLiteSecretStorage } from '../storage/SecretStorage.js';

/** Open the encrypted vault described by the project config. */
export function openVault(configManager: ConfigManager, config: SecretForgeConfig) {
  const crypto = new DefaultCryptoProvider(undefined, config.encryptionKeyPath);
  return new SQLiteSecretStorage(configManager.getDatabasePath(config), crypto);
}

/**
 * Write a file that contains plaintext secrets: created 0600, and existing
 * files are tightened to 0600 before being truncated.
 */
export async function writePrivateFile(path: string, content: string): Promise<void> {
  const handle = await open(path, 'w', 0o600);
  try {
    if (process.platform !== 'win32') await chmod(path, 0o600);
    await handle.writeFile(content, 'utf8');
  } finally {
    await handle.close();
  }
}

export type GitExposure = 'not-a-repo' | 'ignored' | 'untracked-not-ignored' | 'tracked';

/** Determine whether writing plaintext to `path` risks it being committed. */
export function gitExposure(path: string): GitExposure {
  const abs = resolve(path);
  const cwd = dirname(abs);
  const git = (args: string[]) =>
    execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  try {
    git(['rev-parse', '--is-inside-work-tree']);
  } catch {
    return 'not-a-repo';
  }
  try {
    git(['ls-files', '--error-unmatch', '--', abs]);
    return 'tracked';
  } catch {
    // not tracked
  }
  try {
    git(['check-ignore', '-q', '--', abs]);
    return 'ignored';
  } catch {
    return 'untracked-not-ignored';
  }
}
