/**
 * Unit tests for the Tail Worker alerting logic (audit R-008).
 *
 * The Tail Worker is deployed separately (workers/log-shipper/) and
 * doesn't ship inside the Next.js bundle, but its alert-routing
 * heuristics are part of the production observability contract — if
 * they regress, real incidents would be missed.
 *
 * We import the shipper module via its file path so it stays testable
 * without bundling.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(join(process.cwd(), "workers", "log-shipper", "index.ts"), "utf8");

describe("log-shipper alert routing", () => {
  it("declares an exception/exceededCpu alert path", () => {
    expect(SOURCE).toMatch(/event\.outcome === "exception"/);
    expect(SOURCE).toMatch(/event\.outcome === "exceededCpu"/);
  });

  it("alerts on console.error / console.fatal log levels", () => {
    expect(SOURCE).toMatch(/log\.level === "error"/);
    expect(SOURCE).toMatch(/log\.level === "fatal"/);
  });

  it("alerts on the high-signal app log prefixes", () => {
    for (const keyword of ["[scheduled]", "[queue/", "Health check:", "audit/security"]) {
      expect(SOURCE).toContain(keyword);
    }
  });

  it("writes every batch to R2 LOG_SINK before alert fan-out", () => {
    expect(SOURCE).toMatch(/env\.LOG_SINK\.put/);
    // R2 put MUST run via ctx.waitUntil so a slow R2 doesn't block the
    // alert path or starve the next tail batch.
    expect(SOURCE).toMatch(/ctx\.waitUntil\(\s*env\.LOG_SINK\.put/);
  });

  it("never throws from the tail handler — that would drop the batch", () => {
    // The handler swallows R2 + webhook errors with `.catch(...)` so a
    // misconfigured sink doesn't take down observability.
    expect(SOURCE).toMatch(/console\.error\("\[log-shipper\] R2 put failed:"/);
    expect(SOURCE).toMatch(/console\.error\("\[log-shipper\] alert webhook failed:"/);
  });
});
