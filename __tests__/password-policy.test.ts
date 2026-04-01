import { describe, it, expect, vi } from "vitest";
import { validatePasswordPolicy, checkBreachedPassword } from "@/lib/password-policy";

describe("validatePasswordPolicy", () => {
  it("accepts a valid password with all requirements", () => {
    const result = validatePasswordPolicy("Str0ng!Pass");
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });

  it("rejects an empty password", () => {
    const result = validatePasswordPolicy("");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("at least 8 characters");
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = validatePasswordPolicy("Ab1!xyz");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("at least 8 characters");
  });

  it("rejects a password without uppercase letters", () => {
    const result = validatePasswordPolicy("str0ng!pass");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("uppercase");
  });

  it("rejects a password without lowercase letters", () => {
    const result = validatePasswordPolicy("STR0NG!PASS");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("lowercase");
  });

  it("rejects a password without digits", () => {
    const result = validatePasswordPolicy("Strong!Pass");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("digit");
  });

  it("rejects a password without special characters", () => {
    const result = validatePasswordPolicy("Str0ngPass1");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("special character");
  });

  it("accepts a password with exactly 8 characters meeting all rules", () => {
    const result = validatePasswordPolicy("Ab1!cdef");
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });
});

describe("checkBreachedPassword", () => {
  it("returns 0 for a password not found in breaches", async () => {
    const mockResponse = "1234567890ABCDEF1234567890ABCDE:3\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:0";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(mockResponse, { status: 200 }),
    );

    const count = await checkBreachedPassword("a-very-unique-password-unlikely-breached-xyz!");
    // The password hash suffix won't match the mock response lines
    expect(count).toBe(0);
  });

  it("returns -1 when the API returns a non-200 status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Service unavailable", { status: 503 }),
    );

    const count = await checkBreachedPassword("TestPass1!");
    expect(count).toBe(-1);
  });

  it("returns -1 when fetch throws a network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));

    const count = await checkBreachedPassword("TestPass1!");
    expect(count).toBe(-1);
  });
});
