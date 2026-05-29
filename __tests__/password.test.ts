import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("hashPassword", () => {
  it("returns a SHA-256 pre-hashed bcrypt string (#604)", async () => {
    const result = await hashPassword("my-secret");
    expect(result).toMatch(/^\$sha256\$\$2[aby]\$/);
  });

  it("produces different hashes for the same password (random salt)", async () => {
    const a = await hashPassword("password");
    const b = await hashPassword("password");
    expect(a).not.toBe(b);
  });
});

describe("verifyPassword", () => {
  it("returns valid=true for a correct bcrypt password", async () => {
    const hash = await hashPassword("correct-password");
    const result = await verifyPassword("correct-password", hash);
    expect(result.valid).toBe(true);
    expect(result.needsRehash).toBe(false);
  });

  it("returns valid=false for an incorrect password", async () => {
    const hash = await hashPassword("correct-password");
    const result = await verifyPassword("wrong-password", hash);
    expect(result.valid).toBe(false);
  });

  it("returns valid=false for a malformed hash", async () => {
    const result = await verifyPassword("password", "not-a-valid-hash");
    expect(result.valid).toBe(false);
  });

  it("returns valid=false for empty stored hash", async () => {
    const result = await verifyPassword("password", "");
    expect(result.valid).toBe(false);
  });

  it("flags needsRehash=true for a bcrypt hash stored with fewer rounds", async () => {
    // Hash below the current BCRYPT_ROUNDS (G-50 set it to 10) so this still
    // exercises the "upgrade on next login" path.
    const lowRoundHash = await bcrypt.hash("legacy-cost", 8);
    const result = await verifyPassword("legacy-cost", lowRoundHash);
    expect(result.valid).toBe(true);
    expect(result.needsRehash).toBe(true);
  });

  it("does not flag rehash for a hash already at the current cost factor", async () => {
    const hash = await hashPassword("current-cost");
    const result = await verifyPassword("current-cost", hash);
    expect(result.valid).toBe(true);
    expect(result.needsRehash).toBe(false);
  });
});
