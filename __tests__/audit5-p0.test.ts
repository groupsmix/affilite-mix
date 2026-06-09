/**
 * audit5-P0 regression locks.
 *
 * One file per finding so a future refactor that re-introduces the bug
 * fails CI with a finding-specific test name. Each block reads the
 * source file (not the bundled output) to keep the test cheap and
 * independent of route-handler runtime plumbing.
 *
 * Findings covered:
 *   #1  workers/custom-worker.ts wraps the handler with @sentry/cloudflare's withSentry()
 *   #2  /api/community/comments GET has IP rate-limit + isUsableUuid guard
 *   #3  /api/community/wrist-shots GET has IP rate-limit + isUsableUuid guard
 *   #4  /api/quiz/[slug]      GET has IP rate-limit
 *   #5  lib/dal/community.ts list functions take siteId and add .eq("site_id", siteId)
 *   #33 captureException invokes @sentry/cloudflare when isInitialized()===true
 *   #36 public/.well-known/security.txt exists with Contact + Expires fields
 *   #37 docs/runbooks/db-backup-retention.md exists with an RPO/RTO table
 *   #38 docs/runbooks/incident-response.md exists with a severity matrix
 *   #28 docs/runbooks/dlq-overflow.md documents an on-call routing section
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function readRepoFile(rel: string): string {
  return readFileSync(resolve(__dirname, "..", rel), "utf8");
}

describe("audit5-#1 — Worker wraps handler with withSentry", () => {
  const worker = readRepoFile("workers/custom-worker.ts");
  it("imports withSentry from @sentry/cloudflare", () => {
    expect(worker).toMatch(
      /import\s*\{[^}]*\bwithSentry\b[^}]*\}\s*from\s*["']@sentry\/cloudflare["']/,
    );
  });

  it("uses withSentry(...) for the default export, not a bare worker object", () => {
    expect(worker).toMatch(/export\s+default\s+withSentry\s*\(/);
  });

  it("passes SENTRY_DSN through the options callback so init is env-driven", () => {
    expect(worker).toMatch(/env\.SENTRY_DSN/);
  });
});

describe("audit5-#2 — /api/community/comments GET", () => {
  const content = readRepoFile("app/api/community/comments/route.ts");
  it("rate-limits the GET handler per-IP", () => {
    expect(content).toMatch(/checkRateLimit\(\s*`comments-get:/);
  });

  it('uses failPolicy: "open" so a KV outage cannot blank the comment list', () => {
    // The GET block declares failPolicy: "open" — search within a window
    // starting at the GET rate-limit key so we don't accidentally match
    // the POST handler below it.
    const idx = content.indexOf("comments-get:");
    expect(idx).toBeGreaterThan(-1);
    const window = content.slice(idx, idx + 400);
    expect(window).toMatch(/failPolicy:\s*"open"/);
  });

  it("rejects non-UUID target_id with isUsableUuid", () => {
    expect(content).toMatch(/isUsableUuid\(\s*targetId\s*\)/);
  });

  it("passes siteId to listApprovedComments (defense-in-depth #5)", () => {
    expect(content).toMatch(/listApprovedComments\(\s*siteId\s*,/);
  });
});

describe("audit5-#3 — /api/community/wrist-shots GET", () => {
  const content = readRepoFile("app/api/community/wrist-shots/route.ts");
  it("rate-limits the GET handler per-IP with key wrist-shots-get:", () => {
    expect(content).toMatch(/checkRateLimit\(\s*`wrist-shots-get:/);
  });

  it('uses failPolicy: "open" for the read-only GET', () => {
    const idx = content.indexOf("wrist-shots-get:");
    const window = content.slice(idx, idx + 400);
    expect(window).toMatch(/failPolicy:\s*"open"/);
  });

  it("rejects non-UUID product_id with isUsableUuid", () => {
    expect(content).toMatch(/isUsableUuid\(\s*productId\s*\)/);
  });

  it("passes siteId to listApprovedWristShots", () => {
    expect(content).toMatch(/listApprovedWristShots\(\s*siteId\s*,/);
  });
});

describe("audit5-#4 — /api/quiz/[slug] GET", () => {
  const content = readRepoFile("app/api/quiz/[slug]/route.ts");
  it("rate-limits the GET handler per-IP with key quiz-get:", () => {
    expect(content).toMatch(/checkRateLimit\(\s*`quiz-get:/);
  });

  it('uses failPolicy: "open" so a KV outage cannot blank the quiz UI', () => {
    expect(content).toMatch(/failPolicy:\s*"open"/);
  });
});

describe("audit5-#5 — community DAL list functions are site-scoped", () => {
  const content = readRepoFile("lib/dal/community.ts");

  it("listApprovedComments signature starts with siteId: string", () => {
    expect(content).toMatch(
      /export\s+async\s+function\s+listApprovedComments\(\s*\n\s*siteId:\s*string/,
    );
  });

  it("listApprovedWristShots signature starts with siteId: string", () => {
    expect(content).toMatch(
      /export\s+async\s+function\s+listApprovedWristShots\(\s*\n\s*siteId:\s*string/,
    );
  });

  it('listApprovedComments adds .eq("site_id", siteId) to the query', () => {
    const start = content.indexOf("export async function listApprovedComments");
    // Slice up to the next top-level `export async function` or the end
    // of the file so we cover the entire body regardless of length.
    const next = content.indexOf("\nexport async function", start + 1);
    const block = next === -1 ? content.slice(start) : content.slice(start, next);
    expect(block).toMatch(/\.eq\(\s*"site_id"\s*,\s*siteId\s*\)/);
  });

  it('listApprovedWristShots adds .eq("site_id", siteId) to the query', () => {
    const start = content.indexOf("export async function listApprovedWristShots");
    const next = content.indexOf("\nexport async function", start + 1);
    const block = next === -1 ? content.slice(start) : content.slice(start, next);
    expect(block).toMatch(/\.eq\(\s*"site_id"\s*,\s*siteId\s*\)/);
  });
});

describe("audit5-#33 — captureException invokes the Sentry SDK when initialized", () => {
  const sentryCaptureSpy = vi.fn();
  const sentrySetTagSpy = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    sentryCaptureSpy.mockReset();
    sentrySetTagSpy.mockReset();
  });

  it("calls @sentry/cloudflare.captureException with the supplied error + context", async () => {
    vi.doMock("@sentry/cloudflare", () => ({
      captureException: sentryCaptureSpy,
      captureMessage: vi.fn(),
      isInitialized: () => true,
      setTag: sentrySetTagSpy,
      addEventProcessor: vi.fn(),
    }));
    vi.doMock("next/server", () => ({
      after: (cb: () => Promise<void>) => cb(),
    }));

    const { captureException } = await import("@/lib/sentry");

    const err = new Error("boom");
    captureException(err, { traceId: "abcdef", source: "audit5-test" });

    // Wait one microtask for the `after()` callback to flush.
    await Promise.resolve();
    await Promise.resolve();

    expect(sentryCaptureSpy).toHaveBeenCalledTimes(1);
    const [capturedError, opts] = sentryCaptureSpy.mock.calls[0]!;
    expect(capturedError).toBe(err);
    expect(opts).toMatchObject({ data: { traceId: "abcdef", source: "audit5-test" } });
    expect(sentrySetTagSpy).toHaveBeenCalledWith("traceId", "abcdef");
  });

  it("does NOT call the SDK when isInitialized() returns false (still logs to console)", async () => {
    vi.doMock("@sentry/cloudflare", () => ({
      captureException: sentryCaptureSpy,
      captureMessage: vi.fn(),
      isInitialized: () => false,
      setTag: sentrySetTagSpy,
      addEventProcessor: vi.fn(),
    }));
    vi.doMock("next/server", () => ({
      after: (cb: () => Promise<void>) => cb(),
    }));

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { captureException } = await import("@/lib/sentry");
    captureException(new Error("boom"), { traceId: "qrstuv" });

    await Promise.resolve();

    expect(sentryCaptureSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

describe("audit5-#36 — security.txt is served by a dynamic route handler", () => {
  // The repo deliberately ships /.well-known/security.txt as a *route
  // handler* (multi-tenant: per-site `Contact:` and `Canonical:`,
  // `Expires:` rolled forward at request time) rather than a static
  // placeholder. See `app/.well-known/security.txt/route.ts` and the
  // G-02 regression suite. This lock test prevents a future contributor
  // from re-introducing a stale static file that masks the dynamic one.
  it("ships the dynamic route at app/.well-known/security.txt/route.ts", () => {
    const routePath = "app/.well-known/security.txt/route.ts";
    expect(existsSync(resolve(__dirname, "..", routePath))).toBe(true);
    const src = readRepoFile(routePath);
    expect(src).toMatch(/Contact:/);
    expect(src).toMatch(/Expires:/);
  });

  it("does NOT also ship a static placeholder at public/.well-known/security.txt", () => {
    // Two security.txt files = race on which one wins at the edge. The
    // static file would also leak the same `Contact:` to every tenant,
    // defeating the multi-tenant design.
    expect(existsSync(resolve(__dirname, "..", "public/.well-known/security.txt"))).toBe(false);
  });
});

describe("audit5-#37 — docs/runbooks/db-backup-retention.md", () => {
  it("exists and documents RPO/RTO + a quarterly drill cadence", () => {
    const path = "docs/runbooks/db-backup-retention.md";
    expect(existsSync(resolve(__dirname, "..", path))).toBe(true);
    const text = readRepoFile(path);
    expect(text).toMatch(/RPO/i);
    expect(text).toMatch(/RTO/i);
    expect(text).toMatch(/quarterly/i);
  });
});

describe("audit5-#38 — docs/runbooks/incident-response.md", () => {
  it("exists and includes a severity matrix with P0-P3", () => {
    const path = "docs/runbooks/incident-response.md";
    expect(existsSync(resolve(__dirname, "..", path))).toBe(true);
    const text = readRepoFile(path);
    for (const sev of ["P0", "P1", "P2", "P3"]) {
      expect(text).toContain(sev);
    }
  });
});

describe("audit5-#28 — DLQ runbook documents on-call routing", () => {
  it("dlq-overflow.md contains an On-call Routing section", () => {
    const text = readRepoFile("docs/runbooks/dlq-overflow.md");
    expect(text).toMatch(/On-call Routing/);
    // The routing section should at least mention PagerDuty/Opsgenie
    // (the integration target) and the escalation policy shape.
    expect(text).toMatch(/PagerDuty|Opsgenie/);
    expect(text).toMatch(/escalation/i);
  });
});
