/**
 * G-38: Chaos / resilience tests.
 *
 * These tests verify the application degrades gracefully when
 * infrastructure dependencies are unavailable. They run in the
 * weekly chaos workflow and can also be triggered manually.
 */

import { describe, it, expect, vi } from "vitest";

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
    const req = new Request("https://app.example.com/admin");

    // Fuzz-like inputs that should all resolve to the fallback
    const chaosInputs = [
      "https://evil.com",
      "//evil.com",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "ftp://internal/etc/passwd",
      "\thttps://evil.com",
      "https://evil.com%0d%0aSet-Cookie:pwned=1",
      String.fromCharCode(0) + "https://evil.com",
    ];

    for (const input of chaosInputs) {
      const result = safeRedirectUrl(input, req);
      expect(result).not.toContain("evil.com");
      expect(result).not.toContain("javascript:");
      expect(result).not.toContain("data:");
    }
  });
});
