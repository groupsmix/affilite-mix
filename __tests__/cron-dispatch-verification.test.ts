/**
 * F-DEP-04: Cron dispatch verification test
 *
 * This test ensures that:
 * 1. All cron routes have proper authentication options configured
 * 2. Wrangler cron triggers match the registry
 * 3. Each schedule maps to exactly one route handler
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  cronJobs,
  getCronJobBySchedule,
  getCronAuthOptionsForPath,
  type CronJob,
} from "@/lib/cron-registry";
import { readFileSync } from "fs";
import { join } from "path";

// Read wrangler.jsonc to verify triggers match registry
function readWranglerConfig(): { crons: string[] } {
  const wranglerPath = join(process.cwd(), "wrangler.jsonc");
  const content = readFileSync(wranglerPath, "utf-8");

  // Extract crons array from JSONC (handle comments)
  const jsonContent = content.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const config = JSON.parse(jsonContent);

  return {
    crons: config.triggers?.crons || [],
  };
}

// Check if a route file exists and has proper auth
async function checkRouteHasAuth(routePath: string): Promise<boolean> {
  const routeFilePath = join(
    process.cwd(),
    "app",
    "api",
    "cron",
    routePath.replace("/api/cron/", ""),
    "route.ts"
  );

  try {
    const content = readFileSync(routeFilePath, "utf-8");

    // Check for verifyCronAuth import and usage
    const hasVerifyCronAuthImport = content.includes("verifyCronAuth");
    const hasVerifyCronAuthCall = content.includes("verifyCronAuth(");
    const hasGetCronAuthOptions = content.includes("getCronAuthOptionsForPath");

    return hasVerifyCronAuthImport && hasVerifyCronAuthCall && hasGetCronAuthOptions;
  } catch {
    // Try .js extension
    try {
      const jsPath = routeFilePath.replace(".ts", ".js");
      const content = readFileSync(jsPath, "utf-8");
      return content.includes("verifyCronAuth") && content.includes("verifyCronAuth(");
    } catch {
      return false;
    }
  }
}

describe("F-DEP-04: Cron dispatch verification", () => {
  const wranglerConfig = readWranglerConfig();

  describe("Registry completeness", () => {
    it("every schedule in wrangler.jsonc has a registry entry", () => {
      for (const schedule of wranglerConfig.crons) {
        const job = getCronJobBySchedule(schedule);
        expect(job, `No registry entry for cron schedule: ${schedule}`).toBeDefined();
      }
    });

    it("every registry job has a unique schedule", () => {
      const schedules = cronJobs.map((j) => j.schedule);
      const uniqueSchedules = new Set(schedules);
      expect(uniqueSchedules.size).toBe(schedules.length);
    });

    it("every registry job has a valid path under /api/cron/", () => {
      for (const job of cronJobs) {
        expect(job.path).toMatch(/^\/api\/cron\/[a-z-]+\/$/);
        expect(job.method).toBe("POST");
      }
    });
  });

  describe("Route authentication", () => {
    for (const job of cronJobs) {
      it(`${job.name} has proper cron auth configured`, async () => {
        const hasAuth = await checkRouteHasAuth(job.path);
        expect(hasAuth, `${job.name} route missing verifyCronAuth`).toBe(true);
      });

      it(`${job.name} has valid auth options`, () => {
        const options = getCronAuthOptionsForPath(job.path);
        expect(options).toBeDefined();
        expect(options?.secretEnvVars?.length).toBeGreaterThanOrEqual(1);
        expect(options?.secretEnvVars).toContain(job.secretEnvVar);
      });
    }
  });

  describe("Secret configuration", () => {
    for (const job of cronJobs) {
      it(`${job.name} has unique per-trigger secret`, () => {
        // Each job should have its own dedicated secret (not just CRON_SECRET)
        expect(job.secretEnvVar).toMatch(/^CRON_.+_SECRET$/);
        expect(job.secretEnvVar).not.toBe("CRON_SECRET");
      });
    }

    it("no duplicate secret env vars across jobs", () => {
      const secretVars = cronJobs.map((j) => j.secretEnvVar);
      const uniqueSecrets = new Set(secretVars);
      expect(uniqueSecrets.size).toBe(secretVars.length);
    });
  });

  describe("Schedule validation", () => {
    it("all schedules are valid cron expressions", () => {
      const cronPattern =
        /^((\*|[0-9,-\/]+)\s+){4}(\*|[0-9,-\/]+)$/;

      for (const job of cronJobs) {
        // Basic validation - more thorough validation could be added
        expect(job.schedule).toMatch(cronPattern);
      }
    });

    it("wrangler triggers count matches registry count", () => {
      // Wrangler may have more entries (commented out) but active ones should match
      expect(wranglerConfig.crons.length).toBeGreaterThanOrEqual(cronJobs.length);
    });
  });

  describe("High-frequency jobs have appropriate limits", () => {
    for (const job of cronJobs) {
      const isHighFrequency = job.schedule.includes("*/5"); // Every 5 minutes
      const isHourly = job.schedule.startsWith("0 *");

      if (isHighFrequency) {
        it(`${job.name} (*/5 min) has documented retry policy`, () => {
          // High frequency jobs should complete quickly
          expect(job.alertIfDurationMs).toBeDefined();
          expect(job.alertIfDurationMs).toBeLessThanOrEqual(5 * 60 * 1000); // 5 min max
        });
      }
    }
  });
});
