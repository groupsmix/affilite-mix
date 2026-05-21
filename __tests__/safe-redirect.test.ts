import { describe, it, expect } from "vitest";
import { safeRedirectUrl } from "@/lib/safe-redirect";

describe("safeRedirectUrl", () => {
  const request = new Request("https://example.com/some/path");

  it("returns fallback for missing or empty target", () => {
    expect(safeRedirectUrl(null, request)).toBe("/");
    expect(safeRedirectUrl(undefined, request)).toBe("/");
    expect(safeRedirectUrl("", request)).toBe("/");
    expect(safeRedirectUrl("   ", request)).toBe("/");
  });

  it("allows simple relative paths", () => {
    expect(safeRedirectUrl("/admin/dashboard", request)).toBe("/admin/dashboard");
    expect(safeRedirectUrl("/api/auth?foo=bar", request)).toBe("/api/auth?foo=bar");
  });

  it("blocks protocol-relative URLs (//evil.com)", () => {
    // Should fallback, not allow redirect to evil.com
    expect(safeRedirectUrl("//evil.com", request)).toBe("/");
    expect(safeRedirectUrl("\\\\evil.com", request)).toBe("/");
  });

  it("blocks path traversal tricks", () => {
    // If we pass an absolute URL with path traversal, it gets normalized
    // If we pass a relative path, it's considered safe by the function because it's relative.
    // Wait, path traversal in a relative path is still on the same domain, so it's not an open redirect.
    // But let's verify it normalizes safely.
    expect(safeRedirectUrl("https://example.com/admin/../api", request)).toBe("/api");
  });

  it("blocks javascript: and data: schemes", () => {
    expect(safeRedirectUrl("javascript:alert(1)", request)).toBe("/");
    expect(safeRedirectUrl("JAVASCRIPT:alert(1)", request)).toBe("/");
    expect(safeRedirectUrl("data:text/html,<script>alert(1)</script>", request)).toBe("/");
  });

  it("allows same-origin absolute URLs and returns relative path", () => {
    expect(safeRedirectUrl("https://example.com/admin", request)).toBe("/admin");
  });

  it("rejects different-origin absolute URLs by default", () => {
    expect(safeRedirectUrl("https://evil.com/admin", request)).toBe("/");
  });

  it("case-folds origin checks correctly", () => {
    // Origin is always lowercased by the URL parser
    expect(safeRedirectUrl("HTTPS://EXAMPLE.COM/admin", request)).toBe("/admin");
    expect(safeRedirectUrl("https://EVIL.COM", request)).toBe("/");
  });

  it("allows origins from allowedOrigins set", () => {
    const allowed = new Set(["https://trusted.com"]);
    expect(safeRedirectUrl("https://trusted.com/login", request, { allowedOrigins: allowed })).toBe("https://trusted.com/login");
    expect(safeRedirectUrl("https://other.com/login", request, { allowedOrigins: allowed })).toBe("/");
  });
});
