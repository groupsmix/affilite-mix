/**
 * F-01: Static enforcement test — every admin API route MUST import and use
 * a centralized authorization wrapper (requireAdmin, withAuthz, or
 * withAuthzDynamic). This prevents a new admin route from accidentally
 * exposing service-role DAL access without tenant isolation.
 *
 * The test scans all route.ts files under app/api/admin/** and asserts that
 * at least one of the approved authz imports is present. Adding a route
 * without an approved import fails CI.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ADMIN_API_DIR = path.resolve(__dirname, "..", "app", "api", "admin");
const APPROVED_IMPORTS = [
  "requireAdmin",
  "withAuthz",
  "withAuthzDynamic",
];

function findRouteFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findRouteFiles(full));
    } else if (entry.name === "route.ts" || entry.name === "route.tsx") {
      results.push(full);
    }
  }
  return results;
}

describe("F-01: admin route authz enforcement", () => {
  const routeFiles = findRouteFiles(ADMIN_API_DIR);

  it("finds at least one admin route file", () => {
    expect(routeFiles.length).toBeGreaterThan(0);
  });

  for (const filePath of routeFiles) {
    const relative = path.relative(process.cwd(), filePath).replace(/\\/g, "/");

    it(`${relative} imports an approved authz wrapper`, () => {
      const content = fs.readFileSync(filePath, "utf-8");
      const hasApproved = APPROVED_IMPORTS.some((imp) => {
        // Match: import { requireAdmin } from "@/lib/admin-guard"
        // Match: import { withAuthz } from "@/lib/authz"
        // Match: const { requireAdmin } = await import(...)
        const importPattern = new RegExp(
          `(import\\s+[^;]*\\b${imp}\\b|require\\s*\\(\\s*["'\`]@/lib/(admin-guard|authz)["'\`]\\s*\\)|\\b${imp}\\s*\\()`,
        );
        return importPattern.test(content);
      });
      expect(hasApproved).toBe(true);
    });
  }
});
