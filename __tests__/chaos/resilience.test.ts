/**
 * G-38: Chaos / resilience tests.
 *
 * These tests verify the application degrades gracefully when
 * infrastructure dependencies are unavailable. They run in the
 * weekly chaos workflow and can also be triggered manually.
 */

import { describe, it, expect } from "vitest";

describe("Chaos: graceful degradation", () => {
  it("audit-log recordAuditEvent does not throw when DB is unreachable", async () => {
    // Simulate a DB client that always errors
    const failClient = {
      from: () => ({
        insert: () => Promise.resolve({ error: { message: "connection refused" } }),
      }),
    };

    const { recordAuditEvent } = await import("@/lib/audit-log");

    // Should not throw even when DB is down
    await expect(
      recordAuditEvent(
        {
          site_id: "test-site",
          actor: "chaos-test",
          action: "chaos.db-outage",
          entity_type: "test",
          entity_id: "1",
        },
        () => Promise.resolve(failClient as any),
      ),
    ).resolves.not.toThrow();
  });

  it("safeRedirectUrl never redirects to an external origin under chaos input", async () => {
    const { safeRedirectUrl } = await import("@/lib/safe-redirect");
    const req = new Request("https://app.example.com/q7m-k4j9");

    // Fuzz-like inputs that should all resolve to the fallback
    // TESTING-01 (etap-3): includes the backslash-bypass payload that
    // previously slipped through the "relative path is always safe"
    // branch -- the WHATWG URL parser treats `\` as `/`, so
    // `/\evil.com` resolved to `https://evil.com/`.
    const chaosInputs = [
      "https://evil.com",
      "//evil.com",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "ftp://internal/etc/passwd",
      "\thttps://evil.com",
      "https://evil.com%0d%0aSet-Cookie:pwned=1",
      String.fromCharCode(0) + "https://evil.com",
      // SEC-01 (etap-3): backslash-bypass payloads
      "/" + "\\" + "evil.com",
      "/" + "\\" + "\\" + "evil.com",
      "/foo" + "\\" + ".." + "\\" + "evil.com",
      "/" + "\\" + "javascript:alert(1)",
      "\\" + "evil.com",
    ];

    for (const input of chaosInputs) {
      const result = safeRedirectUrl(input, req);
      // The returned value must always resolve to the request origin
      // (same-origin) when interpreted by the browser. We resolve `result`
      // against the request URL and assert the resulting origin matches.
      const resolvedOrigin = new URL(result, req.url).origin;
      expect(resolvedOrigin).toBe(new URL(req.url).origin);
      expect(result).not.toContain("javascript:");
      expect(result).not.toContain("data:");
      // SEC-01: the literal backslash must never appear in the returned
      // value -- it indicates the relative-path branch echoed the raw input.
      expect(result.includes("\\")).toBe(false);
    }
  });
});
