import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("hashPassword", () => {
  it("returns a salt:hash string", async () => {
    const result = await hashPassword("my-secret");
    expect(result).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
  });

  it("produces different hashes for the same password (random salt)", async () => {
    const a = await hashPassword("password");
    const b = await hashPassword("password");
    expect(a).not.toBe(b);
  });
});

describe("verifyPassword", () => {
  it("returns true for a correct password", async () => {
    const hash = await hashPassword("correct-password");
    const result = await verifyPassword("correct-password", hash);
    expect(result).toBe(true);
  });

  it("returns false for an incorrect password", async () => {
    const hash = await hashPassword("correct-password");
    const result = await verifyPassword("wrong-password", hash);
    expect(result).toBe(false);
  });

  it("returns false for a malformed hash", async () => {
    const result = await verifyPassword("password", "not-a-valid-hash");
    expect(result).toBe(false);
  });

  it("returns false for empty stored hash", async () => {
    const result = await verifyPassword("password", "");
    expect(result).toBe(false);
  });
});
