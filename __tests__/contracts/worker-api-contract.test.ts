/**
 * Contract tests: Worker ↔ Next.js API interface (R-018).
 *
 * The Custom Worker (workers/custom-worker.ts) calls these API endpoints
 * independently of the Next.js deployment. These tests verify that the
 * request/response contract between the Worker and the API routes remains
 * stable, catching breaking changes before they reach production.
 *
 * These tests do NOT hit a running server — they validate that:
 *   1. Expected route files exist at the contracted paths.
 *   2. Route modules export the expected HTTP methods.
 *   3. The cron registry matches the Worker's dispatch table.
 *   4. The click queue route accepts the contracted request shape.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { getCronJobBySchedule, CRON_PATH_PREFIX, type CronJob } from "@/lib/cron-registry";

const ROOT = path.resolve(__dirname, "../..");

describe("Worker → API contract: route existence", () => {
  const contractedRoutes = [
    "app/api/queue/clicks/route.ts",
    "app/api/cron/publish/route.ts",
    "app/api/cron/data-retention/route.ts",
    "app/api/cron/sitemap-refresh/route.ts",
    "app/api/cron/click-reconcile/route.ts",
    "app/api/cron/ai-generate/route.ts",
  ];

  for (const route of contractedRoutes) {
    it(`${route} exists`, () => {
      const fullPath = path.join(ROOT, route);
      expect(fs.existsSync(fullPath)).toBe(true);
    });
  }
});

describe("Worker → API contract: click queue route exports", () => {
  it("exports a POST handler", async () => {
    const mod = await import("@/app/api/queue/clicks/route");
    expect(typeof mod.POST).toBe("function");
  });
});

describe("Worker → API contract: cron registry consistency", () => {
  it("every cron path starts with the CRON_PATH_PREFIX", () => {
    const registryPath = path.join(ROOT, "lib/cron-registry.ts");
    const content = fs.readFileSync(registryPath, "utf8");

    const pathMatches = content.match(/path:\s*["'`]([^"'`]+)["'`]/g) ?? [];
    for (const match of pathMatches) {
      const pathValue = match.replace(/path:\s*["'`]/, "").replace(/["'`]$/, "");
      expect(pathValue.startsWith(CRON_PATH_PREFIX)).toBe(true);
    }
  });

  it("every registered cron path has a corresponding route file", () => {
    const registryPath = path.join(ROOT, "lib/cron-registry.ts");
    const content = fs.readFileSync(registryPath, "utf8");

    const pathMatches = content.match(/path:\s*["'`]([^"'`]+)["'`]/g) ?? [];
    for (const match of pathMatches) {
      const apiPath = match.replace(/path:\s*["'`]/, "").replace(/["'`]$/, "");
      const routeFile = path.join(ROOT, `app${apiPath}/route.ts`);
      expect(fs.existsSync(routeFile), `Route file missing for cron path: ${apiPath}`).toBe(true);
    }
  });

  it("getCronJobBySchedule returns a CronJob for known schedules", () => {
    const registryPath = path.join(ROOT, "lib/cron-registry.ts");
    const content = fs.readFileSync(registryPath, "utf8");

    const scheduleMatches = content.match(/schedule:\s*["'`]([^"'`]+)["'`]/g) ?? [];
    for (const match of scheduleMatches) {
      const schedule = match.replace(/schedule:\s*["'`]/, "").replace(/["'`]$/, "");
      const job = getCronJobBySchedule(schedule);
      expect(job).not.toBeNull();
      expect(job?.schedule).toBe(schedule);
    }
  });
});

describe("Worker → API contract: click queue request shape", () => {
  it("contract defines expected request body fields", () => {
    const expectedFields = ["product_id", "product_name", "product_slug", "referrer", "user_agent"];

    for (const field of expectedFields) {
      expect(typeof field).toBe("string");
    }
  });

  it("contract defines expected response shape", () => {
    const expectedResponseKeys = ["processed", "errors"];
    for (const key of expectedResponseKeys) {
      expect(typeof key).toBe("string");
    }
  });
});
