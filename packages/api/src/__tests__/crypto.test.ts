/**
 * Comprehensive tests for SecretForge encryption layer
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  encryptSecret,
  decryptSecret,
  validateMasterKey,
  generateMasterKey,
  reencryptSecret,
  testEncryption,
} from "../crypto";

describe("Encryption Layer", () => {
  let validMasterKey: string;

  beforeAll(() => {
    validMasterKey = generateMasterKey();
  });

  describe("encryptSecret", () => {
    it("should encrypt a secret value", async () => {
      const secret = "my-secret-api-key";
      const encrypted = await encryptSecret(validMasterKey, secret);

      expect(encrypted).toBeTruthy();
      expect(encrypted).not.toEqual(secret);
      expect(encrypted.length).toBeGreaterThan(0);
    });

    it("should produce different ciphertext for same value (due to random salt/IV)", async () => {
      const secret = "my-secret-api-key";
      const encrypted1 = await encryptSecret(validMasterKey, secret);
      const encrypted2 = await encryptSecret(validMasterKey, secret);

      expect(encrypted1).not.toEqual(encrypted2);
    });

    it("should handle empty strings", async () => {
      const encrypted = await encryptSecret(validMasterKey, "");
      expect(encrypted).toBeTruthy();

      const decrypted = await decryptSecret(validMasterKey, encrypted);
      expect(decrypted).toEqual("");
    });

    it("should handle long strings", async () => {
      const longSecret = "x".repeat(10000);
      const encrypted = await encryptSecret(validMasterKey, longSecret);
      const decrypted = await decryptSecret(validMasterKey, encrypted);

      expect(decrypted).toEqual(longSecret);
    });

    it("should handle special characters", async () => {
      const special = "🔐 Secret! @#$%^&*()_+ 你好 мир";
      const encrypted = await encryptSecret(validMasterKey, special);
      const decrypted = await decryptSecret(validMasterKey, encrypted);

      expect(decrypted).toEqual(special);
    });
  });

  describe("decryptSecret", () => {
    it("should decrypt an encrypted secret", async () => {
      const secret = "my-secret-api-key";
      const encrypted = await encryptSecret(validMasterKey, secret);
      const decrypted = await decryptSecret(validMasterKey, encrypted);

      expect(decrypted).toEqual(secret);
    });

    it("should fail with wrong master key", async () => {
      const secret = "my-secret-api-key";
      const encrypted = await encryptSecret(validMasterKey, secret);

      const wrongKey = generateMasterKey();
      await expect(decryptSecret(wrongKey, encrypted)).rejects.toThrow();
    });

    it("should fail with corrupted ciphertext", async () => {
      const secret = "my-secret-api-key";
      const encrypted = await encryptSecret(validMasterKey, secret);

      // Corrupt the ciphertext
      const corrupted = encrypted.slice(0, -10) + "aaaaaaaaaa";
      await expect(decryptSecret(validMasterKey, corrupted)).rejects.toThrow();
    });

    it("should fail with invalid base64", async () => {
      await expect(decryptSecret(validMasterKey, "not-valid-base64!!!")).rejects.toThrow();
    });

    it("should fail with malformed JSON payload", async () => {
      const malformed = btoa('{"invalid": "payload"}');
      await expect(decryptSecret(validMasterKey, malformed)).rejects.toThrow();
    });
  });

  describe("validateMasterKey", () => {
    it("should accept valid master keys", () => {
      const key = generateMasterKey();
      const result = validateMasterKey(key);

      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("should reject short keys", () => {
      const result = validateMasterKey("short");

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("at least 32 characters");
    });

    it("should reject low-entropy keys", () => {
      const lowEntropy = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      const result = validateMasterKey(lowEntropy);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain("insufficient entropy");
    });

    it("should accept high-entropy keys", () => {
      const highEntropy = "aB3$xY9#mK2!qW8@pL5^nC7&tR4*jF1%vG6(hD0)sZ";
      const result = validateMasterKey(highEntropy);

      expect(result.valid).toBe(true);
    });
  });

  describe("generateMasterKey", () => {
    it("should generate a valid master key", () => {
      const key = generateMasterKey();
      const result = validateMasterKey(key);

      expect(result.valid).toBe(true);
    });

    it("should generate keys of specified length", () => {
      const key = generateMasterKey(128);
      expect(key.length).toBe(128);
    });

    it("should generate different keys each time", () => {
      const key1 = generateMasterKey();
      const key2 = generateMasterKey();

      expect(key1).not.toEqual(key2);
    });

    it("should generate keys with sufficient entropy", () => {
      const key = generateMasterKey();
      const uniqueChars = new Set(key.split("")).size;

      expect(uniqueChars).toBeGreaterThanOrEqual(16);
    });
  });

  describe("reencryptSecret", () => {
    it("should re-encrypt with a new master key", async () => {
      const secret = "my-secret-api-key";
      const oldKey = generateMasterKey();
      const newKey = generateMasterKey();

      const encrypted = await encryptSecret(oldKey, secret);
      const reencrypted = await reencryptSecret(oldKey, newKey, encrypted);

      // Should not be able to decrypt with old key
      await expect(decryptSecret(oldKey, reencrypted)).rejects.toThrow();

      // Should be able to decrypt with new key
      const decrypted = await decryptSecret(newKey, reencrypted);
      expect(decrypted).toEqual(secret);
    });

    it("should fail with wrong old key", async () => {
      const secret = "my-secret-api-key";
      const correctKey = generateMasterKey();
      const wrongKey = generateMasterKey();
      const newKey = generateMasterKey();

      const encrypted = await encryptSecret(correctKey, secret);
      await expect(reencryptSecret(wrongKey, newKey, encrypted)).rejects.toThrow();
    });
  });

  describe("testEncryption", () => {
    it("should return true for valid encryption setup", async () => {
      const key = generateMasterKey();
      const result = await testEncryption(key);

      expect(result).toBe(true);
    });

    it("should return false for invalid encryption key", async () => {
      const result = await testEncryption("short");

      expect(result).toBe(false);
    });
  });

  describe("Version Support", () => {
    it("should include version in encrypted payload", async () => {
      const secret = "my-secret-api-key";
      const encrypted = await encryptSecret(validMasterKey, secret);

      const payload = JSON.parse(atob(encrypted));
      expect(payload.version).toBeDefined();
      expect(payload.version).toBe(1);
    });

    it("should include salt in encrypted payload", async () => {
      const secret = "my-secret-api-key";
      const encrypted = await encryptSecret(validMasterKey, secret);

      const payload = JSON.parse(atob(encrypted));
      expect(payload.salt).toBeDefined();
      expect(Array.isArray(payload.salt)).toBe(true);
      expect(payload.salt.length).toBeGreaterThan(0);
    });

    it("should include IV in encrypted payload", async () => {
      const secret = "my-secret-api-key";
      const encrypted = await encryptSecret(validMasterKey, secret);

      const payload = JSON.parse(atob(encrypted));
      expect(payload.iv).toBeDefined();
      expect(Array.isArray(payload.iv)).toBe(true);
      expect(payload.iv.length).toBeGreaterThan(0);
    });

    it("should include encrypted data in payload", async () => {
      const secret = "my-secret-api-key";
      const encrypted = await encryptSecret(validMasterKey, secret);

      const payload = JSON.parse(atob(encrypted));
      expect(payload.data).toBeDefined();
      expect(Array.isArray(payload.data)).toBe(true);
      expect(payload.data.length).toBeGreaterThan(0);
    });
  });

  describe("Performance", () => {
    it("should encrypt in reasonable time", async () => {
      const secret = "my-secret-api-key";
      const start = Date.now();

      await encryptSecret(validMasterKey, secret);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000); // Less than 1 second
    });

    it("should decrypt in reasonable time", async () => {
      const secret = "my-secret-api-key";
      const encrypted = await encryptSecret(validMasterKey, secret);

      const start = Date.now();
      await decryptSecret(validMasterKey, encrypted);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000); // Less than 1 second
    });

    it("should handle batch operations efficiently", async () => {
      const secrets = Array.from({ length: 100 }, (_, i) => `secret-${i}`);

      const start = Date.now();
      await Promise.all(secrets.map((s) => encryptSecret(validMasterKey, s)));
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(5000); // Less than 5 seconds for 100 operations
    });
  });

  describe("Security Properties", () => {
    it("should use different salts for each encryption", async () => {
      const secret = "my-secret-api-key";
      const encrypted1 = await encryptSecret(validMasterKey, secret);
      const encrypted2 = await encryptSecret(validMasterKey, secret);

      const payload1 = JSON.parse(atob(encrypted1));
      const payload2 = JSON.parse(atob(encrypted2));

      expect(payload1.salt).not.toEqual(payload2.salt);
    });

    it("should use different IVs for each encryption", async () => {
      const secret = "my-secret-api-key";
      const encrypted1 = await encryptSecret(validMasterKey, secret);
      const encrypted2 = await encryptSecret(validMasterKey, secret);

      const payload1 = JSON.parse(atob(encrypted1));
      const payload2 = JSON.parse(atob(encrypted2));

      expect(payload1.iv).not.toEqual(payload2.iv);
    });

    it("should produce non-deterministic ciphertexts", async () => {
      const secret = "my-secret-api-key";
      const ciphertexts = new Set();

      for (let i = 0; i < 10; i++) {
        const encrypted = await encryptSecret(validMasterKey, secret);
        ciphertexts.add(encrypted);
      }

      expect(ciphertexts.size).toBe(10); // All should be unique
    });
  });
});
