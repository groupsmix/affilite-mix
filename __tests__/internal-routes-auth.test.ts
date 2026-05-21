/**
 * P1-7: Every app/api/internal/** route.ts MUST import either
 * requireInternalAuth, getInternalToken, verifyInternalHmac, or
 * INTERNAL_HEADER to prove it performs authentication.
 *
 * Routes excluded from middleware (see middleware.ts matcher) must
 * self-authenticate. This test fails closed on missing matches.
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

const AUTH_PATTERNS = [
  "requireInternalAuth",
  "getInternalToken",
  "verifyInternalHmac",
  "INTERNAL_HEADER",
  "getInternalTokenFor",
];

describe("P1-7: Internal API routes must self-authenticate", () => {
  const internalDir = path.resolve("app/api/internal");
  const routeFiles = findRouteFiles(internalDir);

  it("should find at least one internal API route", () => {
    expect(routeFiles.length).toBeGreaterThan(0);
  });

  for (const file of routeFiles) {
    const relativePath = path.relative(process.cwd(), file);

    it(`${relativePath} imports an auth mechanism`, () => {
      const content = fs.readFileSync(file, "utf-8");
      const hasAuth = AUTH_PATTERNS.some((pattern) => content.includes(pattern));
      expect(hasAuth).toBe(true);
    });
  }
});
