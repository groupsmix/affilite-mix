/**
 * Tests for A98-53: TOTP rotation gap and legacy encrypted value handling.
 */

import { describe, it, expect } from "vitest";
import {
  generateTotpSecret,
  isTotpSecretEncrypted,
  needsReEncryption,
  extractEncryptedPayload,
  wrapEncryptedSecret,
  verifyTotpTokenWithRotation,
} from "@/lib/totp";

describe("A98-53: TOTP encryption and rotation", () => {
  describe("isTotpSecretEncrypted", () => {
    it("detects current-key encrypted secrets", () => {
      expect(isTotpSecretEncrypted("enc:v1:abc123")).toBe(true);
    });

    it("detects previous-key encrypted secrets", () => {
      expect(isTotpSecretEncrypted("enc:v0:oldcipher")).toBe(true);
    });

    it("detects plaintext secrets as unencrypted", () => {
      expect(isTotpSecretEncrypted("JBSWY3DPEHPK3PXP")).toBe(false);
    });

    it("handles null/undefined", () => {
      expect(isTotpSecretEncrypted(null)).toBe(false);
      expect(isTotpSecretEncrypted(undefined)).toBe(false);
    });
  });

  describe("needsReEncryption", () => {
    it("returns false for current-key secrets", () => {
      expect(needsReEncryption("enc:v1:abc123")).toBe(false);
    });

    it("returns true for previous-key secrets", () => {
      expect(needsReEncryption("enc:v0:oldcipher")).toBe(true);
    });

    it("returns true for plaintext secrets", () => {
      expect(needsReEncryption("JBSWY3DPEHPK3PXP")).toBe(true);
    });

    it("returns false for null/undefined", () => {
      expect(needsReEncryption(null)).toBe(false);
      expect(needsReEncryption(undefined)).toBe(false);
    });
  });

  describe("extractEncryptedPayload", () => {
    it("extracts payload from current-key secrets", () => {
      expect(extractEncryptedPayload("enc:v1:abc123")).toBe("abc123");
    });

    it("extracts payload from previous-key secrets", () => {
      expect(extractEncryptedPayload("enc:v0:oldcipher")).toBe("oldcipher");
    });

    it("returns null for plaintext", () => {
      expect(extractEncryptedPayload("plaintext")).toBeNull();
    });
  });

  describe("wrapEncryptedSecret", () => {
    it("wraps payload with current key prefix", () => {
      expect(wrapEncryptedSecret("ciphertext")).toBe("enc:v1:ciphertext");
    });
  });

  describe("verifyTotpTokenWithRotation", () => {
    it("verifies with current encryption key", async () => {
      const { secret, algorithm } = generateTotpSecret("test@example.com");
      const encrypted = "enc:v1:" + secret;
      const decryptFn = async (cipher: string) => cipher; // no-op decrypt

      // Generate a valid token using the SAME algorithm used at enrollment
      const OTPAuth = await import("otpauth");
      const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(secret),
        algorithm,
      });
      const token = totp.generate();

      const result = await verifyTotpTokenWithRotation(encrypted, token, decryptFn);
      expect(result.ok).toBe(true);
      expect(typeof result.step).toBe("number");
    });

    it("verifies with previous encryption key fallback", async () => {
      const { secret, algorithm } = generateTotpSecret("test@example.com");
      const encrypted = "enc:v0:" + secret;
      const decryptFn = async (cipher: string, usePrevious: boolean) => {
        if (usePrevious) return cipher;
        return null;
      };

      // Generate a valid token using the SAME algorithm used at enrollment
      const OTPAuth = await import("otpauth");
      const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(secret),
        algorithm,
      });
      const token = totp.generate();

      const result = await verifyTotpTokenWithRotation(encrypted, token, decryptFn);
      expect(result.ok).toBe(true);
      expect(typeof result.step).toBe("number");
    });

    it("rejects invalid token", async () => {
      const { secret } = generateTotpSecret("test@example.com");
      const encrypted = "enc:v1:" + secret;
      const decryptFn = async (cipher: string) => cipher;

      const result = await verifyTotpTokenWithRotation(encrypted, "000000", decryptFn);
      expect(result.ok).toBe(false);
      expect(result.step).toBeNull();
    });

    it("rejects expired/null secrets", async () => {
      const decryptFn = async () => null;
      const result = await verifyTotpTokenWithRotation(null, "123456", decryptFn);
      expect(result.ok).toBe(false);
      expect(result.step).toBeNull();
    });

    it("handles decrypt failure gracefully", async () => {
      const { secret } = generateTotpSecret("test@example.com");
      const encrypted = "enc:v1:" + secret;
      const decryptFn = async () => null; // decryption fails

      const result = await verifyTotpTokenWithRotation(encrypted, "123456", decryptFn);
      expect(result.ok).toBe(false);
      expect(result.step).toBeNull();
    });
  });
});
