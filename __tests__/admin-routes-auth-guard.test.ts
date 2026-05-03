/**
 * A7-05: Every app/api/admin/** route.ts MUST call requireAdmin() (or
 * assertRole / requireAdmin) to ensure auth is not bypassed by a handler
 * that directly creates a Supabase client without the admin guard.
 *
 * This structural test reads each admin route file and verifies it
 * references the shared admin-guard module.
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

const ADMIN_AUTH_PATTERNS = [
  "requireAdmin",
  "assertRole",
  "admin-guard",
  "getAdminSession",
  "withAuthz", // wraps requireAdmin internally via lib/authz.ts
];

describe("A7-05: Admin API routes must use the shared admin guard", () => {
  const adminDir = path.resolve("app/api/admin");
  const routeFiles = findRouteFiles(adminDir);

  it("should find admin API routes", () => {
    expect(routeFiles.length).toBeGreaterThan(0);
  });

  for (const file of routeFiles) {
    const relativePath = path.relative(process.cwd(), file);

    it(`${relativePath} imports an admin auth mechanism`, () => {
      const content = fs.readFileSync(file, "utf-8");
      const hasAdminAuth = ADMIN_AUTH_PATTERNS.some((pattern) => content.includes(pattern));
      expect(hasAdminAuth).toBe(true);
    });
  }
});
