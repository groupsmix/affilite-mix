/**
 * F-015 / F-006: production gate on the shared cron-secret fallback.
 *
 * `verifyCronAuth` must FAIL CLOSED in production when a per-trigger secret is
 * expected (`secretEnvVars.length > 1`) but only the shared `CRON_SECRET` is
 * configured — unless the operator explicitly opts back in via
 * `CRON_ALLOW_SHARED_FALLBACK_IN_PROD`. The existing `cron-auth.test.ts` only
 * exercises the non-production posture (where the fallback is allowed), so this
 * file pins the production-specific behaviour the audit flagged as a documented
 * bypass.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";

// Secrets must clear the 32-byte production minimum (SEC-06) so the per-trigger
// GATE — not the length check — is what rejects them.
const PER_TRIGGER = "per-trigger-secret-0123456789abcdef0123456789"; // > 32 bytes
const SHARED = "shared-cron-secret-0123456789abcdef0123456789"; // > 32 bytes

function makeRequest(token: string): NextRequest {
  return new NextRequest("https://example.com/api/cron/publish", {
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("verifyCronAuth — production shared-fallback gate (F-015)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    // verifyCronAuth reads NODE_ENV at call time; stubEnv keeps tsc happy
    // (NODE_ENV is typed read-only) and auto-restores via unstubAllEnvs.
    vi.stubEnv("NODE_ENV", "production");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("REJECTS the shared CRON_SECRET alone in prod when a per-trigger secret is expected", () => {
    vi.stubEnv("CRON_SECRET", SHARED);
    const ok = verifyCronAuth(makeRequest(SHARED), {
      secretEnvVars: ["CRON_PUBLISH_SECRET", "CRON_SECRET"],
    });
    expect(ok).toBe(false);
  });

  it("ACCEPTS the per-trigger secret in production", () => {
    vi.stubEnv("CRON_PUBLISH_SECRET", PER_TRIGGER);
    vi.stubEnv("CRON_SECRET", SHARED);
    const ok = verifyCronAuth(makeRequest(PER_TRIGGER), {
      secretEnvVars: ["CRON_PUBLISH_SECRET", "CRON_SECRET"],
    });
    expect(ok).toBe(true);
  });

  it("re-allows the shared fallback in prod ONLY when the escape-hatch is explicitly set", () => {
    vi.stubEnv("CRON_SECRET", SHARED);
    vi.stubEnv("CRON_ALLOW_SHARED_FALLBACK_IN_PROD", "1");
    const ok = verifyCronAuth(makeRequest(SHARED), {
      secretEnvVars: ["CRON_PUBLISH_SECRET", "CRON_SECRET"],
    });
    expect(ok).toBe(true);
  });

  it("does not apply the per-trigger gate to legacy single-secret callers", () => {
    // envVars.length === 1 → the gate (envVars.length > 1) never engages.
    vi.stubEnv("CRON_SECRET", SHARED);
    const ok = verifyCronAuth(makeRequest(SHARED), { secretEnvVars: ["CRON_SECRET"] });
    expect(ok).toBe(true);
  });
});
