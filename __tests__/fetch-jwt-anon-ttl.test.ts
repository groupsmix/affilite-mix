/**
 * Regression locks for three independent edge-runtime hardenings:
 *
 * 1. `lib/middleware-site-lookup.ts` must use `fetchWithTimeout`, not the
 *    bare `fetch`, so a slow Supabase round-trip can't hold a Worker
 *    isolate for the full outer middleware budget.
 * 2. `lib/supabase-server.ts:mintSupabaseJwt` must mint per-request
 *    tenant JWTs with a < 5 minute expiry. The token is used for a
 *    single PostgREST call and discarded; a long expiry is a needless
 *    replay window if the token ever lands in a log or proxy buffer.
 * 3. `lib/supabase-server.ts:getAnonClient` must cache the client with
 *    a TTL (currently 5 minutes) and re-mint when the URL/anon key in
 *    `process.env` changes, mirroring the privileged client's TTL.
 *
 * These are source-level static checks — running the full anon/tenant
 * client lifecycle in a vitest is brittle because supabase-js relies
 * on edge-runtime APIs that need a real isolate.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const repoRoot = join(__dirname, "..");

describe("middleware-site-lookup uses fetchWithTimeout", () => {
  const src = readFileSync(join(repoRoot, "lib/middleware-site-lookup.ts"), "utf8");

  it("imports fetchWithTimeout", () => {
    expect(src).toMatch(
      /import\s*\{[^}]*fetchWithTimeout[^}]*\}\s*from\s*['"]@\/lib\/fetch-timeout['"]/,
    );
  });

  it("does not call bare global `fetch(`", () => {
    // Strip comments so the heuristic isn't fooled by JSDoc that
    // mentions `fetch`.
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    expect(stripped).not.toMatch(/(?<![\w.])fetch\s*\(/);
  });

  it("declares a hard timeout for the Supabase lookup", () => {
    expect(src).toMatch(/SITE_LOOKUP_TIMEOUT_MS\s*=\s*\d+/);
  });
});

describe("supabase-server tenant JWT replay window", () => {
  const src = readFileSync(join(repoRoot, "lib/supabase-server.ts"), "utf8");

  it("mints tenant JWTs with a short expiry (<= 300s)", () => {
    const match = src.match(/TENANT_JWT_EXPIRY_SECONDS\s*=\s*(\d+)/);
    expect(match, "TENANT_JWT_EXPIRY_SECONDS constant not found").not.toBeNull();
    const seconds = Number(match![1]);
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(300);
  });

  it("does not hardcode a `1h` expiry anywhere", () => {
    expect(src).not.toMatch(/setExpirationTime\s*\(\s*['"]1h['"]/);
  });
});

describe("supabase-server anon client is never cached (P1-7)", () => {
  const src = readFileSync(join(repoRoot, "lib/supabase-server.ts"), "utf8");

  // P1-7 superseded the earlier "mirror the privileged client's TTL cache"
  // contract: the anon client must NOT be memoised across requests, because
  // even with persistSession=false a shared singleton risks cross-request
  // state bleed through future header/fetch-wrapper/library internals. These
  // assertions pin the no-cache behaviour so a future refactor can't quietly
  // reintroduce a shared anon client.
  it("documents the P1-7 no-cache rationale", () => {
    expect(src).toMatch(/P1-7[\s\S]*?(Do not cache|not cache)/i);
  });

  it("does not declare anon-client cache state", () => {
    expect(src).not.toMatch(/_anonClientCreatedAt/);
    expect(src).not.toMatch(/ANON_CLIENT_TTL_MS/);
  });

  it("getAnonClient constructs a fresh client and returns it directly", () => {
    const start = src.indexOf("export function getAnonClient");
    const fnBody = src.slice(start, src.indexOf("\n}", start));
    // No memoised hand-back of a previously built client.
    expect(fnBody).not.toMatch(/return\s+_anon\w*Client/);
    // It builds a new client inline on every call.
    expect(fnBody).toMatch(/return createClient<Database>\(/);
  });
});
