/**
 * H-3 (#594): Regression tests for TOTP encryption key rotation.
 *
 * Verifies that:
 *   - needsReEncryption detects plaintext and old-version secrets
 *   - decryptAndRotate transparently re-encrypts with the latest key
 *   - Secrets already on the latest key are not unnecessarily rotated
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  encryptTotpSecret,
  decryptTotpSecret,
  needsReEncryption,
  decryptAndRotate,
  isTotpSecretEncrypted,
} from "@/lib/totp-encryption";

const TEST_KEY_V1 = "test-totp-encryption-key-v1-0123456789abcdef";
const TEST_KEY_V2 = "test-totp-encryption-key-v2-fedcba9876543210";

describe("H-3 (#594): TOTP key rotation", () => {
  beforeEach(() => {
    process.env.TOTP_ENCRYPTION_KEY = TEST_KEY_V1;
    delete process.env.TOTP_ENCRYPTION_KEY_V2;
  });

  afterEach(() => {
    delete process.env.TOTP_ENCRYPTION_KEY;
    delete process.env.TOTP_ENCRYPTION_KEY_V2;
  });

  describe("needsReEncryption", () => {
    it("returns true for plaintext secrets", () => {
      process.env.TOTP_ENCRYPTION_KEY = TEST_KEY_V1;
      expect(needsReEncryption("JBSWY3DPEHPK3PXP")).toBe(true);
    });

    it("returns false for v1-encrypted when v1 is latest", async () => {
      process.env.TOTP_ENCRYPTION_KEY = TEST_KEY_V1;
      const encrypted = await encryptTotpSecret("JBSWY3DPEHPK3PXP");
      expect(encrypted.startsWith("enc:v1:")).toBe(true);
      expect(needsReEncryption(encrypted)).toBe(false);
    });

    it("returns true for v1-encrypted when v2 is available", async () => {
      process.env.TOTP_ENCRYPTION_KEY = TEST_KEY_V1;
      const encrypted = await encryptTotpSecret("JBSWY3DPEHPK3PXP");
      // Now set v2
      process.env.TOTP_ENCRYPTION_KEY_V2 = TEST_KEY_V2;
      expect(needsReEncryption(encrypted)).toBe(true);
    });

    it("returns false for v2-encrypted when v2 is latest", async () => {
      process.env.TOTP_ENCRYPTION_KEY = TEST_KEY_V1;
      process.env.TOTP_ENCRYPTION_KEY_V2 = TEST_KEY_V2;
      const encrypted = await encryptTotpSecret("JBSWY3DPEHPK3PXP");
      expect(encrypted.startsWith("enc:v2:")).toBe(true);
      expect(needsReEncryption(encrypted)).toBe(false);
    });

    it("returns false when no key is configured", () => {
      delete process.env.TOTP_ENCRYPTION_KEY;
      expect(needsReEncryption("JBSWY3DPEHPK3PXP")).toBe(false);
    });
  });

  describe("decryptAndRotate", () => {
    it("rotates plaintext to encrypted", async () => {
      const result = await decryptAndRotate("JBSWY3DPEHPK3PXP");
      expect(result.plaintext).toBe("JBSWY3DPEHPK3PXP");
      expect(result.rotated).toBe(true);
      expect(result.newEncrypted).not.toBeNull();
      expect(result.newEncrypted!.startsWith("enc:v1:")).toBe(true);
    });

    it("does not rotate v1-encrypted when v1 is latest", async () => {
      const encrypted = await encryptTotpSecret("JBSWY3DPEHPK3PXP");
      const result = await decryptAndRotate(encrypted);
      expect(result.plaintext).toBe("JBSWY3DPEHPK3PXP");
      expect(result.rotated).toBe(false);
      expect(result.newEncrypted).toBeNull();
    });

    it("rotates v1 to v2 when v2 key is available", async () => {
      const v1Encrypted = await encryptTotpSecret("JBSWY3DPEHPK3PXP");
      expect(v1Encrypted.startsWith("enc:v1:")).toBe(true);

      // Now add v2 key
      process.env.TOTP_ENCRYPTION_KEY_V2 = TEST_KEY_V2;
      const result = await decryptAndRotate(v1Encrypted);
      expect(result.plaintext).toBe("JBSWY3DPEHPK3PXP");
      expect(result.rotated).toBe(true);
      expect(result.newEncrypted!.startsWith("enc:v2:")).toBe(true);

      // Verify the new encrypted value decrypts correctly
      const decrypted = await decryptTotpSecret(result.newEncrypted!);
      expect(decrypted).toBe("JBSWY3DPEHPK3PXP");
    });

    it("does not rotate v2-encrypted when v2 is latest", async () => {
      process.env.TOTP_ENCRYPTION_KEY_V2 = TEST_KEY_V2;
      const encrypted = await encryptTotpSecret("JBSWY3DPEHPK3PXP");
      const result = await decryptAndRotate(encrypted);
      expect(result.rotated).toBe(false);
      expect(result.newEncrypted).toBeNull();
    });
  });

  describe("isTotpSecretEncrypted", () => {
    it("returns false for plaintext", () => {
      expect(isTotpSecretEncrypted("JBSWY3DPEHPK3PXP")).toBe(false);
    });

    it("returns true for enc:v1: prefix", async () => {
      const encrypted = await encryptTotpSecret("JBSWY3DPEHPK3PXP");
      expect(isTotpSecretEncrypted(encrypted)).toBe(true);
    });
  });
});
