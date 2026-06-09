/**
 * Drift guard for the admin path rename (2026-06-09).
 *
 * The legacy `/admin` segment was renamed to a non-function-hinting segment.
 * The legacy path is kept as 410 Gone so:
 *   - search engines deindex it (410 is "permanently gone" per RFC 9110 §15.5.10)
 *   - scanners get no oracle to fingerprint the application
 *   - bookmarks to /admin/login fail loudly rather than silently 404
 *
 * This file pins three properties so a future refactor can't accidentally
 * regress them:
 *
 *   1. The middleware contains the 410 branch and it runs *before* the
 *      timeout / KV / DB machinery.
 *   2. The retired-path boundary is exact (no /administrator false positive).
 *   3. The new segment is not advertised in robots.txt or sitemap.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();
const middlewareSrc = readFileSync(join(repoRoot, "middleware.ts"), "utf8");

describe("legacy /admin path retired — 410 Gone", () => {
  it("middleware defines the retired-admin response helper with status 410", () => {
    expect(middlewareSrc).toContain("RETIRED_ADMIN_PATH_PREFIX");
    expect(middlewareSrc).toContain("isRetiredAdminPath");
    expect(middlewareSrc).toMatch(/status:\s*410/);
  });

  it("410 branch runs before AbortController allocation (cheap path)", () => {
    // The retired check is static and must short-circuit ahead of any
    // timeout / KV / DB work. We pin source ordering: the call site to
    // isRetiredAdminPath inside the middleware body must appear before
    // the `new AbortController()` allocation.
    const callSiteIdx = middlewareSrc.indexOf("isRetiredAdminPath(request");
    const abortIdx = middlewareSrc.search(/new AbortController\(\)/);
    expect(callSiteIdx).toBeGreaterThan(0);
    expect(abortIdx).toBeGreaterThan(0);
    expect(callSiteIdx).toBeLessThan(abortIdx);
  });

  it("response sets X-Robots-Tag: noindex so the path is not reindexed", () => {
    expect(middlewareSrc).toContain("X-Robots-Tag");
    expect(middlewareSrc).toContain("noindex");
  });

  it("path-match boundary is exact — /admin and /admin/* only", () => {
    // Replicate the boundary check inline since we cannot import the
    // middleware module in the test runtime (it pulls Cloudflare deps).
    const PREFIX = "/admin";
    const isRetired = (p: string): boolean => p === PREFIX || p.startsWith(`${PREFIX}/`);
    expect(isRetired("/admin")).toBe(true);
    expect(isRetired("/admin/")).toBe(true);
    expect(isRetired("/admin/login")).toBe(true);
    expect(isRetired("/admin/foo/bar")).toBe(true);
    expect(isRetired("/administrator")).toBe(false);
    expect(isRetired("/admin-panel")).toBe(false);
    expect(isRetired("/adminx")).toBe(false);
    expect(isRetired("/q7m-k4j9")).toBe(false);
    expect(isRetired("/q7m-k4j9/login")).toBe(false);
  });

  it("filesystem: legacy app/admin folder is gone, new segment exists", () => {
    expect(existsSync(join(repoRoot, "app/admin"))).toBe(false);
    expect(existsSync(join(repoRoot, "app/q7m-k4j9"))).toBe(true);
    expect(existsSync(join(repoRoot, "app/q7m-k4j9/login"))).toBe(true);
    expect(existsSync(join(repoRoot, "app/q7m-k4j9/reset-password"))).toBe(true);
  });

  it("robots.ts does not advertise either segment", () => {
    const robots = readFileSync(join(repoRoot, "app/robots.ts"), "utf8");
    // Legacy path: not advertised because it's 410.
    // New path: not advertised because that would publish the segment.
    expect(robots).not.toMatch(/"\/admin\/?"/);
    expect(robots).not.toContain("/q7m-k4j9");
  });

  it("site-context default robotsDisallow does not advertise either segment", () => {
    const siteCtx = readFileSync(join(repoRoot, "lib/site-context.ts"), "utf8");
    // The bracketed robotsDisallow array must not list either path.
    const arrayMatch = siteCtx.match(/robotsDisallow:\s*\[[^\]]*\]/);
    expect(arrayMatch).not.toBeNull();
    const arrayLiteral = arrayMatch![0];
    expect(arrayLiteral).not.toContain("/admin");
    expect(arrayLiteral).not.toContain("/q7m-k4j9");
  });
});
