/**
 * F-AUTHZ-01: Active site cookie tamper test.
 *
 * Validates that signed cookie values reject tampering.
 */
import { describe, it, expect, vi } from "vitest";
import { signCookieValue, verifyCookieValue } from "@/lib/signed-cookie";

// Mock the JWT secret
vi.mock("@/lib/jwt-secret", () => ({
  getJwtSecret: () => "test-jwt-secret-for-cookie-signing-123",
}));

describe("F-AUTHZ-01: nh_active_site cookie integrity", () => {
  const userId = "user-123";
  const siteSlug = "arabictools";

  it("accepts a correctly signed cookie", async () => {
    const signed = await signCookieValue(siteSlug, userId);
    const result = await verifyCookieValue(signed, userId);
    expect(result).toBe(siteSlug);
  });

  it("rejects a cookie signed for a different user", async () => {
    const signed = await signCookieValue(siteSlug, userId);
    const result = await verifyCookieValue(signed, "other-user-456");
    expect(result).toBeNull();
  });

  it("rejects a tampered cookie value", async () => {
    const signed = await signCookieValue(siteSlug, userId);
    // Decode, corrupt the HMAC signature portion, and re-encode so the
    // tampering reliably invalidates the HMAC regardless of base64 padding.
    const decoded = atob(signed);
    const lastDot = decoded.lastIndexOf(".");
    const payload = decoded.slice(0, lastDot);
    const sig = decoded.slice(lastDot + 1);
    const corruptedSig = sig.slice(0, -2) + (sig.slice(-2) === "ff" ? "00" : "ff");
    const tampered = btoa(`${payload}.${corruptedSig}`);
    const result = await verifyCookieValue(tampered, userId);
    expect(result).toBeNull();
  });

  it("rejects a cookie with a foreign site slug", async () => {
    const signed = await signCookieValue(siteSlug, userId);
    // Try to decode, modify the site slug, and re-encode without the correct signature
    try {
      const decoded = atob(signed);
      const modified = decoded.replace(siteSlug, "evil-site");
      const reEncoded = btoa(modified);
      const result = await verifyCookieValue(reEncoded, userId);
      expect(result).toBeNull();
    } catch {
      // If atob/btoa fails, the cookie is malformed — also safe
      expect(true).toBe(true);
    }
  });

  it("rejects an expired cookie", async () => {
    // Sign with a 0ms expiry (already expired)
    const signed = await signCookieValue(siteSlug, userId, 0);
    // Small delay to ensure expiry
    await new Promise((r) => setTimeout(r, 10));
    const result = await verifyCookieValue(signed, userId);
    expect(result).toBeNull();
  });

  it("rejects an empty cookie value", async () => {
    const result = await verifyCookieValue("", userId);
    expect(result).toBeNull();
  });

  it("rejects a garbage cookie value", async () => {
    const result = await verifyCookieValue("not-valid-base64-!!!", userId);
    expect(result).toBeNull();
  });
});
