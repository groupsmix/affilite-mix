import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  API_ROUTE_METADATA,
  API_ROUTE_METADATA_BY_PATH,
  routePathFromFile,
} from "@/lib/api-route-metadata";

const REPO_ROOT = path.resolve(__dirname, "..");
const API_DIR = path.join(REPO_ROOT, "app", "api");

function listRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      out.push(...listRouteFiles(full));
    } else if (entry === "route.ts" || entry === "route.js") {
      out.push(full);
    }
  }
  return out;
}

describe("api route metadata registry", () => {
  const routeFiles = listRouteFiles(API_DIR);
  const discoveredPaths = routeFiles.map((f) => routePathFromFile(f)).sort();

  it("has at least one route on disk (sanity)", () => {
    expect(discoveredPaths.length).toBeGreaterThan(0);
  });

  it("every route on disk has a metadata entry", () => {
    const missing = discoveredPaths.filter((p) => !API_ROUTE_METADATA_BY_PATH.has(p));
    expect(
      missing,
      `The following app/api/**/route.ts files are missing from lib/api-route-metadata.ts:\n  ${missing.join(
        "\n  ",
      )}\nAdd entries to API_ROUTE_METADATA for each new route.`,
    ).toEqual([]);
  });

  it("no metadata entries reference stale / deleted routes", () => {
    const discovered = new Set(discoveredPaths);
    const stale = API_ROUTE_METADATA.map((m) => m.path).filter((p) => !discovered.has(p));
    expect(
      stale,
      `The following metadata entries in lib/api-route-metadata.ts do not correspond to any file in app/api:\n  ${stale.join(
        "\n  ",
      )}\nRemove them, or add the route.`,
    ).toEqual([]);
  });

  it("each metadata entry has required fields populated", () => {
    for (const m of API_ROUTE_METADATA) {
      expect(m.path, `path must be set`).toMatch(/^\/api\//);
      expect(m.methods.length, `${m.path} must declare at least one method`).toBeGreaterThan(0);
      expect(m.auth, `${m.path} must declare an auth requirement`).toBeDefined();
      expect(m.scope, `${m.path} must declare a tenant scope`).toBeDefined();
      expect(typeof m.rateLimit, `${m.path} must declare rateLimit boolean`).toBe("boolean");
      expect(typeof m.csrf, `${m.path} must declare csrf boolean`).toBe("boolean");
      expect(Array.isArray(m.sensitiveFields), `${m.path} must declare sensitiveFields array`).toBe(
        true,
      );
      // requestSchema / responseSchema must be explicit — `undefined` means "not yet thought about".
      expect(
        m.requestSchema === null || typeof m.requestSchema === "string",
        `${m.path} must declare requestSchema (string or null)`,
      ).toBe(true);
      expect(
        m.responseSchema === null || typeof m.responseSchema === "string",
        `${m.path} must declare responseSchema (string or null)`,
      ).toBe(true);
      // Consistency: adminRequired must match auth.
      if (m.auth === "admin" || m.auth === "super_admin") {
        expect(
          m.adminRequired,
          `${m.path}: admin/super_admin routes must set adminRequired=true`,
        ).toBe(true);
      } else {
        expect(m.adminRequired, `${m.path}: non-admin routes must set adminRequired=false`).toBe(
          false,
        );
      }
    }
  });

  it("cookie-authenticated mutating routes enforce CSRF", () => {
    for (const m of API_ROUTE_METADATA) {
      const isMutation = m.methods.some((x) => x !== "GET" && x !== "HEAD" && x !== "OPTIONS");
      const isCookieAuth = m.auth === "admin" || m.auth === "super_admin";
      if (isMutation && isCookieAuth) {
        expect(m.csrf, `${m.path} is a cookie-authenticated mutation and MUST enforce CSRF`).toBe(
          true,
        );
      }
    }
  });
});
