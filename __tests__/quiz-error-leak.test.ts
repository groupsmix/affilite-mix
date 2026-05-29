/**
 * SEC-ERR-01 (#630): Regression test ensuring quiz submit does not
 * leak internal error details to the client.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const routeSource = fs.readFileSync(
  path.resolve(__dirname, "../app/api/quiz/[slug]/submit/route.ts"),
  "utf-8",
);

describe("SEC-ERR-01 (#630): quiz submit error leak prevention", () => {
  it("does not expose err.message in the response body", () => {
    // The old code had: detail: err instanceof Error ? err.message : undefined
    expect(routeSource).not.toMatch(/detail:\s*err\s*(instanceof|\.message)/);
  });

  it("returns a generic error message on 500", () => {
    const catchBlock = routeSource.slice(routeSource.lastIndexOf("catch (err)"));
    expect(catchBlock).toContain('"Failed to submit quiz"');
    // Ensure no `detail` field in the response
    expect(catchBlock).not.toContain("detail:");
  });

  it("logs the error internally via logger", () => {
    expect(routeSource).toContain('logger.error("quiz.submit_failed"');
  });

  it("reports to Sentry via captureException", () => {
    expect(routeSource).toContain("captureException(err");
  });

  it("imports logger and captureException", () => {
    expect(routeSource).toContain("import { logger }");
    expect(routeSource).toContain("import { captureException }");
  });
});
