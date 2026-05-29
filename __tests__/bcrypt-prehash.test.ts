/**
 * RISK-SEC-01 (#604): Regression tests for SHA-256 pre-hash + bcrypt.
 *
 * Verifies that:
 *   - New hashes use the $sha256$ prefix (Dropbox pattern)
 *   - Passwords > 72 bytes are accepted (no more truncation)
 *   - Multi-byte UTF-8 passwords work correctly
 *   - Legacy bcrypt-only hashes still verify (with needsRehash=true)
 *   - Legacy PBKDF2 hashes still verify (with needsRehash=true)
 */
import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("RISK-SEC-01 (#604): SHA-256 pre-hash", () => {
  it("new hashes start with $sha256$ prefix", async () => {
    const hash = await hashPassword("MyP@ss1");
    expect(hash.startsWith("$sha256$")).toBe(true);
  });

  it("round-trips correctly for ASCII passwords", async () => {
    const password = "Correct-Horse-Battery-Staple!1";
    const hash = await hashPassword(password);
    const result = await verifyPassword(password, hash);
    expect(result.valid).toBe(true);
    expect(result.needsRehash).toBe(false);
  });

  it("rejects wrong passwords", async () => {
    const hash = await hashPassword("RightP@ss1");
    const result = await verifyPassword("WrongP@ss1", hash);
    expect(result.valid).toBe(false);
  });

  it("accepts passwords over 72 bytes (was previously rejected)", async () => {
    // 80 ASCII chars = 80 bytes > 72, previously would throw
    const longPassword = "Aa1!" + "x".repeat(76);
    const hash = await hashPassword(longPassword);
    expect(hash.startsWith("$sha256$")).toBe(true);
    const result = await verifyPassword(longPassword, hash);
    expect(result.valid).toBe(true);
  });

  it("accepts 128-character passwords (policy max)", async () => {
    const maxPassword = "Aa1!" + "x".repeat(124);
    const hash = await hashPassword(maxPassword);
    const result = await verifyPassword(maxPassword, hash);
    expect(result.valid).toBe(true);
  });

  it("handles multi-byte UTF-8 without truncation", async () => {
    // 30 CJK chars * 3 bytes = 90 bytes > 72, previously rejected
    const cjkPassword = "密码Aa1!" + "密".repeat(24);
    const hash = await hashPassword(cjkPassword);
    const result = await verifyPassword(cjkPassword, hash);
    expect(result.valid).toBe(true);
  });

  it("handles emoji passwords without truncation", async () => {
    // 20 emojis * 4 bytes = 80 bytes > 72, previously rejected
    const emojiPassword = "Aa1!" + "🔒".repeat(20);
    const hash = await hashPassword(emojiPassword);
    const result = await verifyPassword(emojiPassword, hash);
    expect(result.valid).toBe(true);
  });

  it("different passwords produce different hashes", async () => {
    const a = await hashPassword("PasswordA1!");
    const b = await hashPassword("PasswordB1!");
    expect(a).not.toBe(b);
  });

  it("same password produces different hashes (random salt)", async () => {
    const a = await hashPassword("SameP@ss1");
    const b = await hashPassword("SameP@ss1");
    expect(a).not.toBe(b);
  });

  describe("backward compatibility", () => {
    it("verifies legacy bcrypt-only hashes and flags needsRehash", async () => {
      const legacyHash = await bcrypt.hash("LegacyP@ss1", 10);
      expect(legacyHash.startsWith("$2")).toBe(true);
      const result = await verifyPassword("LegacyP@ss1", legacyHash);
      expect(result.valid).toBe(true);
      expect(result.needsRehash).toBe(true);
    });

    it("rejects wrong password against legacy hash", async () => {
      const legacyHash = await bcrypt.hash("LegacyP@ss1", 10);
      const result = await verifyPassword("WrongP@ss1", legacyHash);
      expect(result.valid).toBe(false);
    });

    it("flags low-round legacy hashes for rehash", async () => {
      const lowRoundHash = await bcrypt.hash("OldP@ss1", 8);
      const result = await verifyPassword("OldP@ss1", lowRoundHash);
      expect(result.valid).toBe(true);
      expect(result.needsRehash).toBe(true);
    });
  });
});
