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

  it("M2: SSRF guard requires https and strips IPv6 brackets before matching", () => {
    // Regression: `new URL("https://[::1]/").hostname` is "[::1]" (bracketed),
    // so the old /^::1$/ pattern never matched and IPv6 loopback slipped
    // through. The guard must strip brackets and detect IPv6 explicitly.
    expect(SOURCE).toMatch(/\^https:\\\/\\\//); // https-only check
    expect(SOURCE).toMatch(/startsWith\("\["\)/);
    expect(SOURCE).toMatch(/looksIpv6/);
    // IPv6 loopback + unique-local + link-local families are blocked.
    expect(SOURCE).toMatch(/\/\^::1\$\//);
    expect(SOURCE).toMatch(/f\[cd\]/); // fc00::/7 (fc.. / fd..)
  });

  it("M2: IPv6 blocklist does not false-positive on hostnames beginning with 'fd'", () => {
    // The old /^fd/ pattern was applied to every hostname, wrongly rejecting
    // legitimate hosts like "fd-metrics.example.com". IPv6 rules must only
    // apply when the host is actually an IPv6 literal.
    expect(SOURCE).toMatch(/looksIpv6\s*\n?\s*\?\s*ipv6Blocked/);
    expect(SOURCE).toContain("ipv4OrHostBlocked");
  });
});
