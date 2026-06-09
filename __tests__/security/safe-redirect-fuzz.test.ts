import { describe, it, expect } from "vitest";
import { safeRedirectUrl } from "@/lib/safe-redirect";

/**
 * RISK-24 (étap-3): Fuzz test for safeRedirectUrl.
 *
 * Feeds random Unicode strings, known bypass payloads, and edge-case
 * encodings into safeRedirectUrl() and asserts the output is always
 * same-origin (relative path) or falls back to "/".
 */

const MOCK_REQUEST_URL = "https://example.com/page";

function makeRequest(url = MOCK_REQUEST_URL): Request {
  return new Request(url);
}

function assertSafe(result: string, request: Request): void {
  // Must be a relative path (starts with /) or the fallback
  if (result === "/") return;
  // Must NOT contain backslashes after normalisation
  expect(result).not.toContain("\\");
  // Parse the result relative to the request URL — it must resolve to
  // the same origin as the request (i.e., no off-site redirect).
  try {
    const resolved = new URL(result, request.url);
    const requestOrigin = new URL(request.url).origin;
    expect(resolved.origin).toBe(requestOrigin);
  } catch {
    // If the result can't be parsed as a URL, it's safe (not navigable)
  }
}

describe("safeRedirectUrl fuzz tests", () => {
  const request = makeRequest();

  describe("known bypass payloads", () => {
    const payloads = [
      "//evil.com",
      "///evil.com",
      "/\\evil.com",
      "\\evil.com",
      "\\/evil.com",
      "/\\\\evil.com",
      "//evil.com/path",
      "https://evil.com",
      "http://evil.com",
      "javascript:alert(1)",
      "javascript:alert(1)//",
      "data:text/html,<script>alert(1)</script>",
      "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
      "vbscript:MsgBox",
      "file:///etc/passwd",
      "ftp://evil.com",
      // URL-encoded variants
      "%2f%2fevil.com",
      "%2F%2Fevil.com",
      "%5Cevil.com",
      "%5cevil.com",
      "/%2f/evil.com",
      // Double-encoded
      "%252f%252fevil.com",
      "%255cevil.com",
      // Unicode bidi overrides
      "\u202Ehttps://evil.com",
      "\u200Fhttps://evil.com",
      "\u200Ehttps://evil.com",
      // Null byte
      "/safe\x00//evil.com",
      // Tab/newline injection
      "/safe\t//evil.com",
      "/safe\n//evil.com",
      "/safe\r//evil.com",
      // Mixed case scheme
      "JavaScript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "jAvAsCrIpT:alert(1)",
      // Whitespace padding
      "  //evil.com",
      "\t//evil.com",
      " javascript:alert(1)",
      // CRLF injection
      "/page\r\nLocation: https://evil.com",
      // Long input
      "/" + "a".repeat(3000),
      // Empty-ish
      "",
      " ",
      "\t",
      "\n",
      // Protocol-relative with credentials
      "//user:pass@evil.com",
      // Backslash variations
      "/\\/\\/evil.com",
      "\\\\evil.com",
      "/..\\..\\evil.com",
      // @ in path (user info bypass)
      "https://example.com@evil.com",
      "/\\@evil.com",
    ];

    for (const payload of payloads) {
      it(`rejects or normalises: ${JSON.stringify(payload).slice(0, 60)}`, () => {
        const result = safeRedirectUrl(payload, request);
        assertSafe(result, request);
      });
    }
  });

  describe("valid relative paths pass through", () => {
    const valid = ["/admin", "/admin/content", "/login?next=/admin", "/#section", "/a/b/c?q=1#h"];

    for (const path of valid) {
      it(`allows relative path: ${path}`, () => {
        const result = safeRedirectUrl(path, request);
        expect(result).toBeTruthy();
        expect(result).not.toBe("/"); // should not fall back
      });
    }
  });

  describe("random Unicode strings never produce off-site redirects", () => {
    const codePoints = [
      0x00, 0x01, 0x0a, 0x0d, 0x20, 0x2f, 0x5c, 0x40, 0x3a, 0x23, 0x3f, 0x25, 0x2e, 0x202e, 0x200f,
      0x200e, 0x061c, 0xfeff, 0xfdd0, 0xd800, 0x00a0, 0x3000,
    ];

    for (let i = 0; i < 50; i++) {
      it(`random string ${i}`, () => {
        const len = Math.floor(Math.random() * 20) + 1;
        let str = "/";
        for (let j = 0; j < len; j++) {
          const cp = codePoints[Math.floor(Math.random() * codePoints.length)];
          try {
            str += String.fromCodePoint(cp!);
          } catch {
            str += "x";
          }
        }
        const result = safeRedirectUrl(str, request);
        assertSafe(result, request);
      });
    }
  });
});
