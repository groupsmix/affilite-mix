import { describe, it, expect } from "vitest";
import { safeRedirectUrl } from "@/lib/safe-redirect";

function makeRequest(url = "https://example.com/admin") {
  return new Request(url);
}

describe("safeRedirectUrl (G-46)", () => {
  it("returns fallback for null/undefined/empty input", () => {
    const req = makeRequest();
    expect(safeRedirectUrl(null, req)).toBe("/");
    expect(safeRedirectUrl(undefined, req)).toBe("/");
    expect(safeRedirectUrl("", req)).toBe("/");
    expect(safeRedirectUrl("   ", req)).toBe("/");
  });

  it("allows relative paths", () => {
    const req = makeRequest();
    expect(safeRedirectUrl("/admin/content", req)).toBe("/admin/content");
    expect(safeRedirectUrl("/search?q=test", req)).toBe("/search?q=test");
  });

  it("rejects protocol-relative URLs (//evil.com)", () => {
    const req = makeRequest();
    expect(safeRedirectUrl("//evil.com/steal", req)).toBe("/");
  });

  it("rejects javascript: scheme", () => {
    const req = makeRequest();
    expect(safeRedirectUrl("javascript:alert(1)", req)).toBe("/");
  });

  it("rejects data: scheme", () => {
    const req = makeRequest();
    expect(safeRedirectUrl("data:text/html,<h1>hi</h1>", req)).toBe("/");
  });

  it("allows same-origin absolute URLs and strips origin", () => {
    const req = makeRequest("https://example.com/admin");
    const result = safeRedirectUrl("https://example.com/dashboard", req);
    expect(result).toBe("/dashboard");
  });

  it("rejects cross-origin URLs not in allow-list", () => {
    const req = makeRequest();
    expect(safeRedirectUrl("https://evil.com/phish", req)).toBe("/");
  });

  it("allows cross-origin URLs in allow-list", () => {
    const req = makeRequest();
    const allowed = new Set(["https://trusted.com"]);
    expect(safeRedirectUrl("https://trusted.com/callback", req, { allowedOrigins: allowed })).toBe(
      "https://trusted.com/callback",
    );
  });

  it("uses custom fallback when provided", () => {
    const req = makeRequest();
    expect(safeRedirectUrl("https://evil.com", req, { fallback: "/admin" })).toBe("/admin");
  });
});
