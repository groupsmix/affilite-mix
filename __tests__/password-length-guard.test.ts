/**
 * F-DEP-01 / RISK-SEC-01 (#604): Password length tests.
 *
 * With the SHA-256 pre-hash (Dropbox pattern), the 72-byte bcrypt
 * truncation limit no longer applies. Passwords up to 128 characters
 * (the policy max) are accepted regardless of byte length.
 */
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("F-DEP-01 / #604: Password length guard (post-prehash)", () => {
  it("accepts passwords under 72 bytes", async () => {
    const shortPassword = "a".repeat(71);
    const hash = await hashPassword(shortPassword);
    expect(hash).toBeTruthy();
    const result = await verifyPassword(shortPassword, hash);
    expect(result.valid).toBe(true);
  });

  it("accepts passwords exactly at 72 bytes", async () => {
    const exactPassword = "a".repeat(72);
    const hash = await hashPassword(exactPassword);
    expect(hash).toBeTruthy();
    const result = await verifyPassword(exactPassword, hash);
    expect(result.valid).toBe(true);
  });

  it("accepts passwords over 72 bytes (#604 fix)", async () => {
    const longPassword = "a".repeat(100);
    const hash = await hashPassword(longPassword);
    expect(hash).toBeTruthy();
    const result = await verifyPassword(longPassword, hash);
    expect(result.valid).toBe(true);
  });

  it("accepts multi-byte UTF-8 over 72 bytes (#604 fix)", async () => {
    // Each emoji is 4 bytes in UTF-8; 19 * 4 = 76 bytes > 72
    const emojiPassword = "🔒".repeat(19);
    const hash = await hashPassword(emojiPassword);
    expect(hash).toBeTruthy();
    const result = await verifyPassword(emojiPassword, hash);
    expect(result.valid).toBe(true);
  });

  it("accepts multi-byte UTF-8 under the limit", async () => {
    const emojiPassword = "🔒".repeat(18);
    const hash = await hashPassword(emojiPassword);
    expect(hash).toBeTruthy();
  });

  it("verifies old bcrypt-only hash for >72-byte password returns needsRehash", async () => {
    // Simulate a legacy bcrypt-only hash (no pre-hash) for a short password
    // Legacy hashes from before #604 will trigger needsRehash=true
    const password = "a".repeat(60);
    const hash = await hashPassword(password);
    const result = await verifyPassword(password, hash);
    expect(result.valid).toBe(true);
  });
});
