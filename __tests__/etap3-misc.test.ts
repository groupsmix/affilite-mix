/**
 * SEC-06 / SEC-07 (etap-3): smaller hardening fixes.
 *
 *  - SEC-06: cron-auth minimum secret length enforced in production.
 *  - SEC-07: sanitize-html restricts <a target> to safe values.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

describe("SEC-06: cron-auth minimum secret length", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("rejects a short secret in production even when the bearer matches", async () => {
    const shortSecret = "abc"; // 3 bytes
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_PUBLISH_SECRET", shortSecret);
    // Silence the misconfig warning
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const { verifyCronAuth } = await import("@/lib/cron-auth");
      const req = new NextRequest("https://example.com/api/cron/publish", {
        headers: { authorization: `Bearer ${shortSecret}` },
      });
      expect(verifyCronAuth(req, { secretEnvVars: ["CRON_PUBLISH_SECRET", "CRON_SECRET"] })).toBe(
        false,
      );
      expect(err).toHaveBeenCalled();
    } finally {
      err.mockRestore();
    }
  });

  it("accepts a 32+ byte secret in production", async () => {
    const okSecret = "a".repeat(32);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_PUBLISH_SECRET", okSecret);
    vi.resetModules();
    const { verifyCronAuth } = await import("@/lib/cron-auth");
    const req = new NextRequest("https://example.com/api/cron/publish", {
      headers: { authorization: `Bearer ${okSecret}` },
    });
    expect(verifyCronAuth(req, { secretEnvVars: ["CRON_PUBLISH_SECRET", "CRON_SECRET"] })).toBe(
      true,
    );
  });

  it("allows short secrets in non-production environments (legacy dev test compat)", async () => {
    const shortSecret = "abc";
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CRON_PUBLISH_SECRET", shortSecret);
    vi.resetModules();
    const { verifyCronAuth } = await import("@/lib/cron-auth");
    const req = new NextRequest("https://example.com/api/cron/publish", {
      headers: { authorization: `Bearer ${shortSecret}` },
    });
    expect(verifyCronAuth(req, { secretEnvVars: ["CRON_PUBLISH_SECRET", "CRON_SECRET"] })).toBe(
      true,
    );
  });
});

describe("SEC-07: sanitize-html restricts <a target>", () => {
  it('keeps target="_blank"', async () => {
    const { sanitizeHtml } = await import("@/lib/sanitize-html");
    const out = sanitizeHtml('<a href="/x" target="_blank">x</a>');
    expect(out).toContain('target="_blank"');
  });

  it('keeps target="_self"', async () => {
    const { sanitizeHtml } = await import("@/lib/sanitize-html");
    const out = sanitizeHtml('<a href="/x" target="_self">x</a>');
    expect(out).toContain('target="_self"');
  });

  it('strips target="_top" (iframe escape)', async () => {
    const { sanitizeHtml } = await import("@/lib/sanitize-html");
    const out = sanitizeHtml('<a href="/x" target="_top">x</a>');
    expect(out).not.toContain('target="_top"');
    // The <a> tag itself is preserved (it's an allowed tag); only the
    // target attribute is dropped.
    expect(out).toContain("<a");
    expect(out).toContain("/x");
  });

  it('strips target="_parent"', async () => {
    const { sanitizeHtml } = await import("@/lib/sanitize-html");
    const out = sanitizeHtml('<a href="/x" target="_parent">x</a>');
    expect(out).not.toContain('target="_parent"');
  });

  it("strips arbitrary target values", async () => {
    const { sanitizeHtml } = await import("@/lib/sanitize-html");
    const out = sanitizeHtml('<a href="/x" target="javascript:alert(1)">x</a>');
    expect(out).not.toContain("javascript");
  });
});
