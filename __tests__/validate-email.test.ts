import { describe, it, expect } from "vitest";
import {
  isValidEmail,
  normalizeEmail,
  getRateLimitEmailKey,
  hashEmailForRateLimit,
} from "@/lib/validate-email";

describe("isValidEmail", () => {
  it("accepts valid email addresses", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("user+tag@example.com")).toBe(true);
    expect(isValidEmail("user.name@sub.domain.com")).toBe(true);
  });

  it("rejects invalid email addresses", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("@example.com")).toBe(false);
    expect(isValidEmail("user@")).toBe(false);
    expect(isValidEmail("user @example.com")).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("trims whitespace and lowercases", () => {
    expect(normalizeEmail("  User@Example.COM  ")).toBe("user@example.com");
  });
});

describe("getRateLimitEmailKey", () => {
  it("strips + alias tags", () => {
    expect(getRateLimitEmailKey("user+tag@example.com")).toBe("user@example.com");
  });

  it("handles emails without + tags", () => {
    expect(getRateLimitEmailKey("user@example.com")).toBe("user@example.com");
  });

  it("normalizes before stripping", () => {
    expect(getRateLimitEmailKey("  User+Tag@Example.COM  ")).toBe("user@example.com");
  });
});

describe("hashEmailForRateLimit (F-007)", () => {
  it("returns a 32-character hex string", async () => {
    const hash = await hashEmailForRateLimit("user@example.com");
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
  });

  it("produces the same hash for the same email", async () => {
    const a = await hashEmailForRateLimit("user@example.com");
    const b = await hashEmailForRateLimit("user@example.com");
    expect(a).toBe(b);
  });

  it("produces the same hash regardless of case or whitespace", async () => {
    const a = await hashEmailForRateLimit("  User@Example.COM  ");
    const b = await hashEmailForRateLimit("user@example.com");
    expect(a).toBe(b);
  });

  it("produces the same hash for + alias variants", async () => {
    const a = await hashEmailForRateLimit("user+spam@example.com");
    const b = await hashEmailForRateLimit("user@example.com");
    expect(a).toBe(b);
  });

  it("produces different hashes for different emails", async () => {
    const a = await hashEmailForRateLimit("user@example.com");
    const b = await hashEmailForRateLimit("other@example.com");
    expect(a).not.toBe(b);
  });
});
