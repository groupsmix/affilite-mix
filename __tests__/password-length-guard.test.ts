/**
 * F-DEP-01: Regression test for bcryptjs 72-byte password truncation guard.
 */
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("F-DEP-01: Password length guard", () => {
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

  it("rejects passwords over 72 bytes on hash", async () => {
    const longPassword = "a".repeat(73);
    await expect(hashPassword(longPassword)).rejects.toThrow(
      "Password too long (>72 bytes after UTF-8 encode)",
    );
  });

  it("rejects passwords over 72 bytes on verify", async () => {
    const longPassword = "a".repeat(73);
    const result = await verifyPassword(longPassword, "$2b$12$somehashvalue");
    expect(result.valid).toBe(false);
  });

  it("handles multi-byte UTF-8 characters correctly", async () => {
    // Each emoji is 4 bytes in UTF-8
    const emojiPassword = "🔒".repeat(19); // 19 * 4 = 76 bytes > 72
    await expect(hashPassword(emojiPassword)).rejects.toThrow(
      "Password too long (>72 bytes after UTF-8 encode)",
    );
  });

  it("accepts multi-byte UTF-8 under the limit", async () => {
    // 18 * 4 = 72 bytes, exactly at limit
    const emojiPassword = "🔒".repeat(18);
    const hash = await hashPassword(emojiPassword);
    expect(hash).toBeTruthy();
  });
});
