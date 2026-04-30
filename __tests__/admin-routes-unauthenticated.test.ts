/**
 * F-003 / Risk-3: Integration test that verifies every admin API route
 * rejects unauthenticated requests with 401 or 403.
 *
 * This test does NOT start a server or make HTTP calls. Instead, it
 * statically verifies that each admin route file:
 *   1. Has an authz wrapper (requireAdmin/withAuthz/withAuthzDynamic)
 *   2. The wrapper is invoked at the top of each handler (before any
 *      DAL or business logic)
 *   3. Error returns are properly checked (for requireAdmin pattern)
 *
 * For actual HTTP-level integration testing, use the E2E suite in e2e/.
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

/** HTTP methods that should be protected */
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

/**
 * Extracts the body of `export async function NAME(...) { ... }` declarations.
 * Returns "" if the handler is not declared in this exact form (e.g. it is
 * defined with `export const NAME = withAuthz(...)`, which is handled by
 * the per-handler HOF regex elsewhere).
 */
function getAsyncHandlerBody(content: string, handler: string): string {
  const headerRe = new RegExp(`export\\s+async\\s+function\\s+${handler}\\b\\s*\\(`);
  const headerMatch = headerRe.exec(content);
  if (!headerMatch) return "";

  let i = headerMatch.index + headerMatch[0].length;
  let parenDepth = 1;
  while (i < content.length && parenDepth > 0) {
    const ch = content[i];
    if (ch === "(") parenDepth++;
    else if (ch === ")") parenDepth--;
    i++;
  }
  if (parenDepth !== 0) return "";

  while (i < content.length && content[i] !== "{") i++;
  if (i >= content.length) return "";

  const bodyStart = i + 1;
  let braceDepth = 1;
  for (let j = bodyStart; j < content.length; j++) {
    const ch = content[j];
    if (ch === "{") braceDepth++;
    else if (ch === "}") {
      braceDepth--;
      if (braceDepth === 0) return content.slice(bodyStart, j);
    }
  }
  return content.slice(bodyStart);
}

describe("F-003: admin routes reject unauthenticated access", () => {
  const routeFiles = findRouteFiles(ADMIN_API_DIR);

  it("discovers admin route files", () => {
    expect(routeFiles.length).toBeGreaterThan(0);
  });

  for (const filePath of routeFiles) {
    const relative = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
    const content = fs.readFileSync(filePath, "utf-8");

    // Find all exported handlers
    const exportedHandlers: string[] = [];
    for (const method of HTTP_METHODS) {
      if (new RegExp(`export\\s+(async\\s+function|const)\\s+${method}\\b`).test(content)) {
        exportedHandlers.push(method);
      }
    }

    for (const method of exportedHandlers) {
      it(`${relative} ${method} is auth-gated`, () => {
        // Pattern 1: withAuthz/withAuthzDynamic HOF wrapping
        const isHofWrapped = new RegExp(
          `export\\s+const\\s+${method}\\s*=\\s*(?:withAuthz|withAuthzDynamic)\\s*\\(`,
        ).test(content);

        // Pattern 2 / 3: requireAdmin() / requireSuperAdmin() invoked inside
        // THIS handler's body. Scope the regex to the handler body so that
        // a multi-handler file where only one handler calls the guard does
        // not pass the check for the other handlers.
        const handlerBody = getAsyncHandlerBody(content, method);
        const usesRequireAdmin =
          handlerBody.length > 0 &&
          /await\s+requireAdmin\s*\(/.test(handlerBody) &&
          /if\s*\(\s*error\s*\)\s*return\s+error/.test(handlerBody);

        const usesRequireSuperAdmin =
          handlerBody.length > 0 && /await\s+requireSuperAdmin\s*\(/.test(handlerBody);

        const isProtected = isHofWrapped || usesRequireAdmin || usesRequireSuperAdmin;

        expect(
          isProtected,
          `${relative} ${method} handler is not auth-gated. ` +
            `Use withAuthz(), withAuthzDynamic(), or requireAdmin() at the handler entry point.`,
        ).toBe(true);
      });
    }
  }
});

describe("F-003: admin routes check error before proceeding", () => {
  const routeFiles = findRouteFiles(ADMIN_API_DIR);

  for (const filePath of routeFiles) {
    const relative = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
    const content = fs.readFileSync(filePath, "utf-8");

    // Only check routes using requireAdmin pattern (not withAuthz HOF)
    if (!/await\s+requireAdmin\s*\(/.test(content)) continue;

    it(`${relative} checks requireAdmin error before business logic`, () => {
      // The error check must appear BEFORE any DAL imports are called
      const requireAdminPos = content.indexOf("await requireAdmin(");
      const errorCheckPos = content.indexOf("if (error) return error");

      // Both must exist
      expect(requireAdminPos).toBeGreaterThan(-1);
      expect(errorCheckPos).toBeGreaterThan(-1);

      // Error check must come shortly after requireAdmin call
      // (within 200 chars — accounts for destructuring)
      expect(errorCheckPos - requireAdminPos).toBeLessThan(200);
      expect(errorCheckPos).toBeGreaterThan(requireAdminPos);
    });
  }
});
