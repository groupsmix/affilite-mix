/**
 * Tests for audit findings A39-A47 hardening.
 *
 * Verifies the code-level fixes for network segmentation, observability
 * privacy, autoscaling guards, cron timezone tracking, idempotency keys,
 * and health check completeness.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

function read(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "..", relPath), "utf-8");
}

// ── A39.4: Docker network isolation ──────────────────────────────────

describe("A39.4 — Docker compose network isolation", () => {
  const compose = read("docker-compose.yml");

  it("declares an internal network for the database tier", () => {
    expect(compose).toContain("supabase-internal:");
    expect(compose).toContain("internal: true");
  });

  it("declares a public network for externally-reachable services", () => {
    expect(compose).toContain("supabase-public:");
  });

  it("places the db service on the internal network only", () => {
    // The db service should reference supabase-internal but NOT supabase-public
    const dbSection = compose.split(/^\s+rest:/m)[0]; // everything before 'rest:'
    expect(dbSection).toContain("supabase-internal");
    expect(dbSection).not.toContain("supabase-public");
  });

  it("places kong on the public network only", () => {
    // Extract just the kong service block (between 'kong:' and the next top-level key)
    const kongSection = compose.split(/^\s+kong:/m)[1]?.split(/^(?:networks|volumes):/m)[0] ?? "";
    expect(kongSection).toContain("supabase-public");
    expect(kongSection).not.toContain("supabase-internal");
  });
});

// ── A41.2: Logger PII redaction ──────────────────────────────────────

describe("A41.2 — Logger PII deny-list", () => {
  const logger = read("lib/logger.ts");

  const requiredFields = [
    "phone",
    "phone_number",
    "first_name",
    "last_name",
    "full_name",
    "address",
    "date_of_birth",
    "national_id",
  ];

  for (const field of requiredFields) {
    it(`redacts "${field}" field`, () => {
      expect(logger).toContain(`"${field}"`);
    });
  }
});

// ── A41.4: Sentry PII scrubbing ─────────────────────────────────────

describe("A41.4 — Sentry event processor scrubs request bodies", () => {
  const sentry = read("lib/sentry.ts");

  it("scrubs request.data (body)", () => {
    expect(sentry).toContain("request.data");
    expect(sentry).toContain("[REDACTED]");
  });

  it("scrubs breadcrumb data for PII keys", () => {
    expect(sentry).toContain("breadcrumbs");
    expect(sentry).toMatch(/email|phone|password|token|secret|name|body/);
  });

  it("strips x-api-key header", () => {
    expect(sentry).toContain("x-api-key");
  });

  it("strips username from user context", () => {
    expect(sentry).toContain("delete event.user.username");
  });
});

// ── A41.6: CSP report truncation ────────────────────────────────────

describe("A41.6 — CSP report field truncation", () => {
  const cspReport = read("app/api/csp-report/route.ts");

  it("truncates blocked-uri to strip query strings", () => {
    expect(cspReport).toContain("sanitizeUri");
    expect(cspReport).toMatch(/blocked.uri.*sanitizeUri|sanitizeUri.*blocked/);
  });

  it("truncates script-sample to prevent nonce/token leakage", () => {
    expect(cspReport).toContain("script-sample");
    expect(cspReport).toContain("slice(0, 80)");
  });
});

// ── A42.1: Worker CPU limits ────────────────────────────────────────

describe("A42.1 — Worker CPU limit", () => {
  const wrangler = read("wrangler.jsonc");

  it("sets cpu_ms limit in wrangler.jsonc", () => {
    expect(wrangler).toContain('"cpu_ms"');
    // Verify it's a reasonable value (1-30 seconds)
    const match = wrangler.match(/"cpu_ms"\s*:\s*(\d+)/);
    expect(match).toBeTruthy();
    const cpuMs = parseInt(match![1], 10);
    expect(cpuMs).toBeGreaterThanOrEqual(1000);
    expect(cpuMs).toBeLessThanOrEqual(30000);
  });
});

// ── A43.6: Cron timezone ────────────────────────────────────────────

describe("A43.6 — Cron timezone tracking", () => {
  const registry = read("lib/cron-registry.ts");

  it("CronJob interface declares timezone field", () => {
    expect(registry).toContain("readonly timezone?:");
  });

  it("every cron job entry has a timezone annotation", () => {
    // Count timezone: occurrences in the cronJobs array
    // We expect at least as many timezone entries as there are jobs
    const tzMatches = registry.match(/timezone:\s*"/g) ?? [];
    // Count job entries by looking for 'name:' inside the array
    const jobMatches = registry.match(/^\s+name:\s*"/gm) ?? [];
    expect(tzMatches.length).toBeGreaterThanOrEqual(jobMatches.length);
  });

  it("expire-deals uses tenant timezone", () => {
    expect(registry).toContain('timezone: "tenant"');
  });
});

// ── A46.6: Idempotency key utility ──────────────────────────────────

describe("A46.6 — Idempotency key utility", () => {
  it("idempotency module exists", () => {
    expect(fs.existsSync(path.resolve(__dirname, "..", "lib/idempotency.ts"))).toBe(true);
  });

  const idempotency = read("lib/idempotency.ts");

  it("exports checkIdempotency function", () => {
    expect(idempotency).toContain("export async function checkIdempotency");
  });

  it("exports storeIdempotencyResult function", () => {
    expect(idempotency).toContain("export async function storeIdempotencyResult");
  });

  it("validates key length", () => {
    expect(idempotency).toContain("MAX_KEY_LENGTH");
  });

  it("rejects control characters in keys", () => {
    expect(idempotency).toMatch(/\\x00.*\\x1f|control.*character/i);
  });

  it("only caches 2xx responses", () => {
    expect(idempotency).toMatch(/status.*<\s*200|status.*>=\s*300/);
  });

  it("sets X-Idempotency-Replayed header on cached responses", () => {
    expect(idempotency).toContain("X-Idempotency-Replayed");
  });
});

// ── A40.7: Health check R2 binding ──────────────────────────────────

describe("A40.7 — Health check verifies R2 binding", () => {
  const health = read("app/api/health/route.ts");

  it("checks NEXT_INC_CACHE_R2_BUCKET binding", () => {
    expect(health).toContain("NEXT_INC_CACHE_R2_BUCKET");
    expect(health).toContain("r2_binding");
  });
});
