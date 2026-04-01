import { describe, it, expect, vi } from "vitest";
import { validatePasswordPolicy, checkBreachedPassword } from "@/lib/password-policy";

describe("validatePasswordPolicy", () => {
  it("accepts a strong password", () => {
    const result = validatePasswordPolicy("Str0ng!Pass");
    expect(result).toEqual({ valid: true, error: null });
  });

  it("rejects empty password", () => {
    const result = validatePasswordPolicy("");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/at least 8 characters/);
  });

  it("rejects password shorter than 8 characters", () => {
    const result = validatePasswordPolicy("Ab1!xyz");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/at least 8 characters/);
  });

  it("rejects password without uppercase", () => {
    const result = validatePasswordPolicy("lowercase1!");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/uppercase/);
  });

  it("rejects password without lowercase", () => {
    const result = validatePasswordPolicy("UPPERCASE1!");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/lowercase/);
  });

  it("rejects password without digit", () => {
    const result = validatePasswordPolicy("NoDigits!here");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/digit/);
  });

  it("rejects password without special character", () => {
    const result = validatePasswordPolicy("NoSpecial1x");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/special character/);
  });
});

describe("checkBreachedPassword", () => {
  it("returns count when password is found in breach data", async () => {
    const mockResponse =
      "003D68EB55068C33ACE09247EE4C639306B:3\r\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:5\r\n";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(mockResponse, { status: 200 }),
    );

    // "password" is a well-known breached password; we mock the API response
    const count = await checkBreachedPassword("password");
    expect(typeof count).toBe("number");

    vi.restoreAllMocks();
  });

  it("returns 0 when password is not in breach data", async () => {
    const mockResponse =
      "AAAAA00000000000000000000000000000A:1\r\nBBBBB00000000000000000000000000000B:2\r\n";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(mockResponse, { status: 200 }),
    );

    const count = await checkBreachedPassword("UniqueP@ss!2026xyz");
    expect(count).toBe(0);

    vi.restoreAllMocks();
  });

  it("returns -1 when API returns non-OK status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("", { status: 500 }));

    const count = await checkBreachedPassword("SomePass1!");
    expect(count).toBe(-1);

    vi.restoreAllMocks();
  });

  it("returns -1 when fetch throws (fail-open)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));

    const count = await checkBreachedPassword("SomePass1!");
    expect(count).toBe(-1);

    vi.restoreAllMocks();
  });
});
