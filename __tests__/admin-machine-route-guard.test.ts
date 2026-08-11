import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { MACHINE_DENIED_ADMIN_ROUTE_PREFIXES } from "@/lib/admin-guard";

const ADMIN_API_ROOT = path.resolve(process.cwd(), "app/api/admin");

function findRouteFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...findRouteFiles(fullPath));
    else if (entry.name === "route.ts" || entry.name === "route.tsx") files.push(fullPath);
  }
  return files;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("machine-denied admin routes use request-aware guards", () => {
  for (const routePrefix of MACHINE_DENIED_ADMIN_ROUTE_PREFIXES) {
    const relativeRoute = routePrefix.replace(/^\/api\/admin\/?/, "");
    const routeFiles = findRouteFiles(path.join(ADMIN_API_ROOT, relativeRoute));

    it(`${routePrefix} has no bare admin guard calls`, () => {
      expect(routeFiles.length, `No route files found for ${routePrefix}`).toBeGreaterThan(0);
      for (const routeFile of routeFiles) {
        const source = stripComments(fs.readFileSync(routeFile, "utf8"));
        expect(source, routeFile).not.toMatch(/\brequireAdmin\(\s*\)/);
        expect(source, routeFile).not.toMatch(/\brequireAdminSession\(\s*\)/);
      }
    });
  }
});
