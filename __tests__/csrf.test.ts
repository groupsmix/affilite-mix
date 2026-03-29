import { describe, it, expect } from "vitest";
import { generateCsrfToken, validateCsrfToken } from "@/lib/csrf";

describe("generateCsrfToken", () => {
  it("returns a 64-character hex string", () => {
    const token = generateCsrfToken();
    expect(token).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(token)).toBe(true);
  });

  it("generates unique tokens each call", () => {
    const a = generateCsrfToken();
    const b = generateCsrfToken();
    expect(a).not.toBe(b);
  });
});

describe("validateCsrfToken", () => {
  it("returns true when cookie and header match", () => {
    const token = generateCsrfToken();
    expect(validateCsrfToken(token, token)).toBe(true);
  });

  it("returns false when cookie and header differ", () => {
    const a = generateCsrfToken();
    const b = generateCsrfToken();
    expect(validateCsrfToken(a, b)).toBe(false);
  });

  it("returns false when cookie is undefined", () => {
    expect(validateCsrfToken(undefined, "some-token")).toBe(false);
  });

  it("returns false when header is undefined", () => {
    expect(validateCsrfToken("some-token", undefined)).toBe(false);
  });

  it("returns false when both are undefined", () => {
    expect(validateCsrfToken(undefined, undefined)).toBe(false);
  });

  it("returns false for empty strings", () => {
    expect(validateCsrfToken("", "")).toBe(false);
  });
});
