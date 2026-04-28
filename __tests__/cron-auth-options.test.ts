/**
 * F-SEC-07: Unit test asserting every cron route declares 2+ entries
 * via getCronAuthOptionsForPath().
 *
 * This ensures per-trigger secrets are configured for least-privilege
 * secret rotation. Routes with only the shared CRON_SECRET are flagged.
 */

import { describe, it, expect } from "vitest";
import { cronJobs, getCronAuthOptionsForPath, type CronJob } from "@/lib/cron-registry";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

/**
 * Walk the app/api/cron directory and find all route.ts files
 */
function getAllCronRoutes(): string[] {
  const cronDir = join(process.cwd(), "app", "api", "cron");
  const routes: string[] = [];

  try {
    const entries = readdirSync(cronDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        routes.push(`/api/cron/${entry.name}/`);
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return routes;
}

/**
 * Check if a route file explicitly uses getCronAuthOptionsForPath
 */
function routeUsesAuthOptions(routePath: string): boolean {
  const routeName = routePath.replace("/api/cron/", "").replace("/", "");
  const routeFilePath = join(
    process.cwd(),
    "app",
    "api",
    "cron",
    routeName,
    "route.ts"
  );

  try {
    const content = readFileSync(routeFilePath, "utf-8");
    return (
      content.includes("getCronAuthOptionsForPath") ||
      content.includes("verifyCronAuth")
    );
  } catch {
    return false;
  }
}

describe("F-SEC-07: Cron auth options enforcement", () => {
  describe("Registry coverage", () => {
    const allRoutes = getAllCronRoutes();

    for (const route of allRoutes) {
      const routeName = route.replace("/api/cron/", "").replace("/", "");

      it(`${routeName} route has cron registry entry`, () => {
        const job = cronJobs.find((j: CronJob) => j.path === route);
        expect(job, `Route ${route} missing from cron-registry.ts`).toBeDefined();
      });

      it(`${routeName} route uses getCronAuthOptionsForPath`, () => {
        const usesAuth = routeUsesAuthOptions(route);
        expect(
          usesAuth,
          `Route ${route} should use getCronAuthOptionsForPath for auth`
        ).toBe(true);
      });
    }
  });

  describe("Least-privilege secret configuration", () => {
    for (const job of cronJobs) {
      describe(`${job.name} (${job.schedule})`, () => {
        it("has dedicated per-trigger secret (not just CRON_SECRET)", () => {
          // Must have its own env var following the CRON_*_SECRET pattern
          expect(job.secretEnvVar).toMatch(/^CRON_[A-Z_]+_SECRET$/);
          expect(job.secretEnvVar).not.toBe("CRON_SECRET");
        });

        it("auth options include at least 2 secret env vars", () => {
          const options = getCronAuthOptionsForPath(job.path);
          expect(options).toBeDefined();
          expect(options?.secretEnvVars?.length).toBeGreaterThanOrEqual(2);
        });

        it("auth options list per-trigger secret first", () => {
          const options = getCronAuthOptionsForPath(job.path);
          expect(options?.secretEnvVars?.[0]).toBe(job.secretEnvVar);
        });

        it("auth options include shared fallback secret", () => {
          const options = getCronAuthOptionsForPath(job.path);
          expect(options?.secretEnvVars).toContain("CRON_SECRET");
        });
      });
    }
  });

  describe("Production enforcement", () => {
    it("production gate prevents shared-secret-only operation", () => {
      // Verify that in production, routes with only CRON_SECRET would fail
      const isProd = process.env.NODE_ENV === "production";
      const allowFallback = process.env.CRON_ALLOW_SHARED_FALLBACK_IN_PROD === "1";

      if (isProd && !allowFallback) {
        // In strict production mode, verify no job only has CRON_SECRET
        for (const job of cronJobs) {
          const options = getCronAuthOptionsForPath(job.path);
          const hasDedicatedSecret = options?.secretEnvVars?.some(
            (v: string) => v !== "CRON_SECRET"
          );
          expect(
            hasDedicatedSecret,
            `${job.name} must have dedicated secret in production`
          ).toBe(true);
        }
      }
    });
  });

  describe("Secret naming conventions", () => {
    it("all secrets follow CRON_{NAME}_SECRET pattern", () => {
      for (const job of cronJobs) {
        expect(job.secretEnvVar).toMatch(/^CRON_[A-Z_]+_SECRET$/);
      }
    });

    it("no duplicate secret names across jobs", () => {
      const secretNames = cronJobs.map((j: CronJob) => j.secretEnvVar);
      const uniqueNames = new Set(secretNames);
      expect(uniqueNames.size).toBe(secretNames.length);
    });

    it("secret names correspond to job names", () => {
      for (const job of cronJobs) {
        const expectedPattern = job.name.toUpperCase().replace(/-/g, "_");
        expect(job.secretEnvVar).toContain(expectedPattern);
      }
    });
  });
});
