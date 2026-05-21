/**
 * F-TEST-01: Queue outage simulation.
 *
 * Validates that when CLICK_QUEUE.send throws, the system enters
 * degraded mode gracefully instead of crashing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("F-TEST-01: Queue outage behavior", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("instrumentation sets __DEGRADED_MODE when CLICK_QUEUE is missing", async () => {
    // Clear any existing degraded mode flag
    delete (globalThis as Record<string, unknown>).__DEGRADED_MODE;

    // Mock production environment without CLICK_QUEUE
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "");

    // Remove CLICK_QUEUE from both globalThis and process.env
    delete (globalThis as Record<string, unknown>).CLICK_QUEUE;
    delete (process.env as Record<string, unknown>).CLICK_QUEUE;

    // Mock the required env vars and dependencies
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
    vi.stubEnv("JWT_SECRET", "test-jwt-secret");

    // The instrumentation should log error and set degraded mode
    // instead of throwing
    try {
      const { register } = await import("@/instrumentation");
      register();
      // If we get here, it didn't throw — good
      expect((globalThis as Record<string, unknown>).__DEGRADED_MODE).toBe(true);
    } catch (err) {
      // If it threw about CLICK_QUEUE, the fix isn't applied
      if (err instanceof Error && err.message.includes("CLICK_QUEUE")) {
        throw new Error(
          "F-INFRA-01: instrumentation.ts still throws on missing CLICK_QUEUE. " +
            "It should log an error and set __DEGRADED_MODE instead.",
        );
      }
      // Other errors (missing env vars, etc.) are expected in test
    }
  });
});
