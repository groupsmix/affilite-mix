/**
 * PR-F P2-C: Regression locks for the CSP-report endpoint payload cap.
 *
 * The endpoint is rate-limited per-IP (60 req/min) but historically had
 * no payload-size enforcement, so a misbehaving extension or hostile
 * client could ship arbitrary JSON for our server to parse and forward
 * to Sentry. This test pins the 8 KB cap declared in
 * `app/api/csp-report/route.ts`.
 */
import { describe, it, expect } from "vitest";

describe("/api/csp-report payload cap", () => {
  let src = "";
  it("loads the route source for static inspection", async () => {
    const { promises: fs } = await import("node:fs");
    const path = await import("node:path");
    src = await fs.readFile(
      path.resolve(__dirname, "..", "app", "api", "csp-report", "route.ts"),
      "utf8",
    );
    expect(src.length).toBeGreaterThan(100);
  });

  it("declares CSP_REPORT_MAX_BYTES at 8 KB", async () => {
    const { promises: fs } = await import("node:fs");
    const path = await import("node:path");
    src = await fs.readFile(
      path.resolve(__dirname, "..", "app", "api", "csp-report", "route.ts"),
      "utf8",
    );
    expect(src).toMatch(/CSP_REPORT_MAX_BYTES\s*=\s*8\s*\*\s*1024/);
  });

  it("rejects on the Content-Length header before reading the body", async () => {
    const { promises: fs } = await import("node:fs");
    const path = await import("node:path");
    src = await fs.readFile(
      path.resolve(__dirname, "..", "app", "api", "csp-report", "route.ts"),
      "utf8",
    );
    expect(src).toMatch(/content-length/i);
    expect(src).toMatch(/CSP_REPORT_MAX_BYTES[\s\S]*413/);
  });

  it("checks the raw body length after reading to defend against omitted Content-Length", async () => {
    const { promises: fs } = await import("node:fs");
    const path = await import("node:path");
    src = await fs.readFile(
      path.resolve(__dirname, "..", "app", "api", "csp-report", "route.ts"),
      "utf8",
    );
    // The body length check must reference CSP_REPORT_MAX_BYTES AFTER
    // the `await request.text()` call (chunked-transfer requests can
    // omit Content-Length, so the header check alone is insufficient).
    expect(src).toMatch(
      /raw\s*=\s*await\s+request\.text\(\)[\s\S]*raw\.length\s*>\s*CSP_REPORT_MAX_BYTES/,
    );
  });

  it("preserves the rate-limit guard at 60/min ahead of body parsing", async () => {
    const { promises: fs } = await import("node:fs");
    const path = await import("node:path");
    src = await fs.readFile(
      path.resolve(__dirname, "..", "app", "api", "csp-report", "route.ts"),
      "utf8",
    );
    expect(src).toMatch(/checkRateLimit\(`csp-report:\$\{ip\}`/);
    expect(src).toMatch(/maxRequests:\s*60[\s\S]*windowMs:\s*60_000/);
  });
});
