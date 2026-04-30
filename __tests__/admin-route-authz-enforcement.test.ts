/**
 * F-01 / F-003: Static enforcement test — every admin API route MUST import
 * AND CALL a centralized authorization wrapper (requireAdmin, withAuthz, or
 * withAuthzDynamic). This prevents a new admin route from accidentally
 * exposing service-role DAL access without tenant isolation.
 *
 * F-003 enhancement: The test now verifies that the wrapper is not just
 * imported but actually invoked. A route that imports `requireAdmin` but
 * never calls it (or never checks the returned `error`) is flagged.
 *
 * Patterns detected:
 *   - `await requireAdmin()` followed by `if (error)` early-return
 *   - `export const GET = withAuthz(...)` — HOF wrapper
 *   - `export const GET = withAuthzDynamic(...)` — HOF wrapper
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ADMIN_API_DIR = path.resolve(__dirname, "..", "app", "api", "admin");

function findRouteFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
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

/**
 * F-003: Verify the authz wrapper is actually CALLED, not just imported.
 * Returns a diagnostic object so test failures include why it failed.
 */
function verifyAuthzCall(content: string): {
  imported: boolean;
  called: boolean;
  pattern: string;
} {
  // Pattern 1: requireAdmin() called and error checked
  const requireAdminImported = /import\s+[^;]*\brequireAdmin\b/.test(content);
  const requireAdminCalled =
    /await\s+requireAdmin\s*\(/.test(content) && /if\s*\(\s*error\s*\)/.test(content);

  if (requireAdminImported && requireAdminCalled) {
    return { imported: true, called: true, pattern: "requireAdmin" };
  }

  // Pattern 2: withAuthz used as HOF wrapper on exported handler
  const withAuthzImported = /import\s+[^;]*\bwithAuthz\b/.test(content);
  const withAuthzCalled = /export\s+const\s+\w+\s*=\s*withAuthz\s*\(/.test(content);

  if (withAuthzImported && withAuthzCalled) {
    return { imported: true, called: true, pattern: "withAuthz" };
  }

  // Pattern 3: withAuthzDynamic used as HOF wrapper on exported handler
  const withAuthzDynamicImported = /import\s+[^;]*\bwithAuthzDynamic\b/.test(content);
  const withAuthzDynamicCalled = /export\s+const\s+\w+\s*=\s*withAuthzDynamic\s*\(/.test(content);

  if (withAuthzDynamicImported && withAuthzDynamicCalled) {
    return { imported: true, called: true, pattern: "withAuthzDynamic" };
  }

  // Pattern 4: requireSuperAdmin (for sites/users routes)
  const requireSuperImported = /import\s+[^;]*\brequireSuperAdmin\b/.test(content);
  const requireSuperCalled = /await\s+requireSuperAdmin\s*\(/.test(content);

  if (requireSuperImported && requireSuperCalled) {
    return { imported: true, called: true, pattern: "requireSuperAdmin" };
  }

  // Determine what went wrong for diagnostics
  const anyImported =
    requireAdminImported || withAuthzImported || withAuthzDynamicImported || requireSuperImported;
  const anyCalled =
    requireAdminCalled || withAuthzCalled || withAuthzDynamicCalled || requireSuperCalled;

  return {
    imported: anyImported,
    called: anyCalled,
    pattern: anyImported ? "imported-but-not-called" : "none",
  };
}

/**
 * Extract all exported HTTP handler names (GET, POST, PATCH, PUT, DELETE)
 * and verify each one is wrapped or guarded.
 */
function getExportedHandlers(content: string): string[] {
  const handlers: string[] = [];
  // Match: export async function GET/POST/PATCH/PUT/DELETE
  const asyncFnPattern = /export\s+async\s+function\s+(GET|POST|PATCH|PUT|DELETE)\b/g;
  let match: RegExpExecArray | null;
  while ((match = asyncFnPattern.exec(content)) !== null) {
    handlers.push(match[1]);
  }
  // Match: export const GET = withAuthz(...)
  const constPattern = /export\s+const\s+(GET|POST|PATCH|PUT|DELETE)\s*=/g;
  while ((match = constPattern.exec(content)) !== null) {
    handlers.push(match[1]);
  }
  return [...new Set(handlers)];
}

describe("F-01 / F-003: admin route authz enforcement", () => {
  const routeFiles = findRouteFiles(ADMIN_API_DIR);

  it("finds at least one admin route file", () => {
    expect(routeFiles.length).toBeGreaterThan(0);
  });

  for (const filePath of routeFiles) {
    const relative = path.relative(process.cwd(), filePath).replace(/\\/g, "/");

    it(`${relative} imports AND calls an approved authz wrapper`, () => {
      const content = fs.readFileSync(filePath, "utf-8");
      const result = verifyAuthzCall(content);

      // F-003: Must be both imported AND called
      expect(result.imported).toBe(true);
      expect(result.called).toBe(true);
    });

    it(`${relative} wraps every exported handler with authz`, () => {
      const content = fs.readFileSync(filePath, "utf-8");
      const handlers = getExportedHandlers(content);

      for (const handler of handlers) {
        // For withAuthz/withAuthzDynamic pattern: export const GET = withAuthz(...)
        const isHofWrapped = new RegExp(
          `export\\s+const\\s+${handler}\\s*=\\s*(?:withAuthz|withAuthzDynamic)\\s*\\(`,
        ).test(content);

        // For requireAdmin pattern: the function body must call requireAdmin()
        const isAsyncGuarded =
          new RegExp(`export\\s+async\\s+function\\s+${handler}\\b`).test(content) &&
          /await\s+requireAdmin\s*\(/.test(content);

        expect(
          isHofWrapped || isAsyncGuarded,
          `Handler ${handler} in ${relative} is not wrapped with authz`,
        ).toBe(true);
      }
    });
  }
});
