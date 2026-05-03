/**
 * A8-05: Every admin mutation route (POST/PUT/PATCH/DELETE) MUST import
 * recordAuditEvent from lib/audit-log to ensure state-changing operations
 * are auditable.
 *
 * Routes that are purely read-like despite using POST (e.g. preview-token
 * generation) are listed in KNOWN_EXCEPTIONS.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

function findRouteFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findRouteFiles(fullPath));
    } else if (entry.name === "route.ts" || entry.name === "route.tsx") {
      results.push(fullPath);
    }
  }
  return results;
}

/** Routes that legitimately do not need audit logging. */
const KNOWN_EXCEPTIONS = new Set([
  // Preview token is a short-lived read-like operation
  "app/api/admin/preview-token/route.ts",
  // Analytics is a read-only GET endpoint (POST used for query body)
  "app/api/admin/analytics/route.ts",
  // Active site selection is a UI preference, not a data mutation
  "app/api/admin/sites/active/route.ts",
  // Site stats is read-only
  "app/api/admin/sites/stats/route.ts",
  // Categories usage is read-only
  "app/api/admin/categories/usage/route.ts",
  // Product export is a download, not a mutation
  "app/api/admin/products/export/route.ts",
]);

const MUTATION_RE = /export\s+(?:async\s+)?(?:function|const)\s+(POST|PUT|PATCH|DELETE)\b/;

describe("A8-05: Admin mutation routes must import recordAuditEvent", () => {
  const adminDir = path.resolve("app/api/admin");
  const routeFiles = findRouteFiles(adminDir);

  it("should find admin API routes", () => {
    expect(routeFiles.length).toBeGreaterThan(0);
  });

  for (const file of routeFiles) {
    const relativePath = path.relative(process.cwd(), file);
    if (KNOWN_EXCEPTIONS.has(relativePath)) continue;

    const content = fs.readFileSync(file, "utf-8");
    const hasMutation = MUTATION_RE.test(content);
    if (!hasMutation) continue;

    it(`${relativePath} imports recordAuditEvent`, () => {
      expect(content.includes("recordAuditEvent") || content.includes("audit-log")).toBe(true);
    });
  }
});
