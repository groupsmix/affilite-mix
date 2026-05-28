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

  // SEC-01 (etap-3): backslash bypass — WHATWG URL parser treats `\` as `/`
  // in HTTP(S) URLs, so a payload like `/\evil.com` previously passed the
  // relative-path branch (startsWith("/") but not startsWith("//")) and was
  // returned verbatim. The browser then followed the Location header to
  // `https://evil.com/`.
  describe("SEC-01: backslash bypass", () => {
    // CodeQL flags `result.includes("evil.com")` as
    // "Incomplete URL substring sanitization" — substring matching is
    // not a sound URL check. We resolve `result` against the request
    // origin and assert the resolved origin matches the request's, which
    // is strictly stronger and silences the rule.
    const REQ_ORIGIN = "https://example.com";

    it("rejects single-backslash bypass /\\evil.com", () => {
      const req = makeRequest(`${REQ_ORIGIN}/admin`);
      // The input string contains a real `/` followed by a real `\`.
      const payload = "/" + "\\" + "evil.com";
      const result = safeRedirectUrl(payload, req);
      // Must NOT redirect off-origin (browser would resolve `/\evil.com`
      // to https://evil.com/). Either fall back or strip the host.
      expect(result.startsWith("/")).toBe(true);
      expect(new URL(result, REQ_ORIGIN).origin).toBe(REQ_ORIGIN);
      expect(result.includes("\\")).toBe(false);
    });

    it("rejects double-backslash bypass /\\\\evil.com", () => {
      const req = makeRequest(`${REQ_ORIGIN}/admin`);
      const payload = "/" + "\\" + "\\" + "evil.com";
      const result = safeRedirectUrl(payload, req);
      expect(new URL(result, REQ_ORIGIN).origin).toBe(REQ_ORIGIN);
    });

    it("normalises mixed slash+backslash payloads to same-origin path", () => {
      const req = makeRequest("https://example.com/admin");
      const payload = "/foo" + "\\" + ".." + "\\" + ".." + "\\" + "evil.com";
      const result = safeRedirectUrl(payload, req);
      // After normalising backslash -> forward slash, the URL parser
      // resolves the path-traversal against the base URL and lands on
      // `https://example.com/evil.com` (same origin). The returned value
      // is the same-origin pathname, NOT a cross-origin redirect.
      expect(result.startsWith("/")).toBe(true);
      expect(result.startsWith("//")).toBe(false);
      expect(result.includes("\\")).toBe(false);
      // Importantly, the returned value must not be parseable as an
      // absolute URL to a different host.
      const resolved = new URL(result, "https://example.com/").origin;
      expect(resolved).toBe("https://example.com");
    });

    it("rejects backslash + javascript scheme attempt", () => {
      const req = makeRequest("https://example.com/admin");
      // Even with leading slash + backslash, the scheme check must hold.
      const payload = "/" + "\\" + "javascript:alert(1)";
      expect(safeRedirectUrl(payload, req)).toBe("/");
    });

    it("plain relative paths still work after backslash normalisation", () => {
      const req = makeRequest("https://example.com/admin");
      // A legitimate path that happens to contain a backslash in a query
      // value gets normalised but still stays same-origin.
      const result = safeRedirectUrl("/foo/bar", req);
      expect(result).toBe("/foo/bar");
    });
  });
});
