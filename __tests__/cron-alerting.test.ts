/**
 * OBS-CRON-01 (#588): Regression tests for cron dispatch error alerting.
 *
 * Verifies that cron scheduled handler error paths call captureException
 * so silent failures trigger Sentry alerts.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const workerSource = fs.readFileSync(
  path.resolve(__dirname, "../workers/custom-worker.ts"),
  "utf-8",
);

describe("OBS-CRON-01 (#588): Cron dispatch error alerting", () => {
  it("imports captureException from @sentry/cloudflare", () => {
    expect(workerSource).toMatch(
      /import\s*\{[^}]*captureException[^}]*\}\s*from\s*["']@sentry\/cloudflare["']/,
    );
  });

  it("calls captureException in the unknown-schedule error path", () => {
    // The block after "Unknown cron schedule" must call captureException
    const unknownScheduleBlock = workerSource.slice(workerSource.indexOf("Unknown cron schedule"));
    const nextReturn = unknownScheduleBlock.indexOf("return;");
    const blockBeforeReturn = unknownScheduleBlock.slice(0, nextReturn);
    expect(blockBeforeReturn).toContain("captureException");
  });

  it("calls captureException in the missing-secret error path", () => {
    // The block after "Neither ${job.secretEnvVar}" must call captureException
    const missingSecretBlock = workerSource.slice(workerSource.indexOf("is configured"));
    const nextReturn = missingSecretBlock.indexOf("return;");
    const blockBeforeReturn = missingSecretBlock.slice(0, nextReturn);
    expect(blockBeforeReturn).toContain("captureException");
  });

  it("calls captureException on a non-2xx dispatch response", () => {
    // The fetch is now awaited and a non-2xx response builds an error, logs it,
    // calls captureException, and re-throws so Cloudflare can retry/back-off.
    const anchor = workerSource.indexOf("cron dispatch failed");
    expect(anchor).toBeGreaterThan(-1);
    const block = workerSource.slice(anchor);
    const throwAnchor = block.indexOf("throw dispatchErr");
    expect(throwAnchor).toBeGreaterThan(-1);
    const blockContent = block.slice(0, throwAnchor);
    expect(blockContent).toContain("captureException");
  });

  it("all cron dispatch error returns in scheduled() are preceded by captureException", () => {
    // Extract the scheduled() function body
    const scheduledStart = workerSource.indexOf("async scheduled(");
    const scheduledEnd = workerSource.indexOf("async queue(");
    const scheduledBody = workerSource.slice(scheduledStart, scheduledEnd);

    // Find all "return;" in the scheduled body and verify captureException precedes them
    const lines = scheduledBody.split("\n");
    let silentReturns = 0;
    let hasCaptureBeforeReturn = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.includes("captureException") || trimmed.includes("throw new Error")) {
        hasCaptureBeforeReturn = true;
      }
      if (trimmed === "return;" && !hasCaptureBeforeReturn) {
        silentReturns++;
      }
      if (trimmed === "return;") {
        hasCaptureBeforeReturn = false;
      }
    }
    expect(silentReturns).toBe(0);
  });
});
