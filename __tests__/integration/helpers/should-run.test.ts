/**
 * Tests for the integration-test gate (J-1).
 *
 * These tests re-import the module after mutating `process.env` so they
 * exercise the actual gate logic rather than relying on whatever snapshot
 * vitest captured at first import.  Each test restores the original env
 * on teardown so unit suites stay deterministic.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function loadGate(): Promise<boolean> {
  vi.resetModules();
  const mod = await import("./should-run");
  return mod.shouldRunSupabaseIntegration;
}

describe("shouldRunSupabaseIntegration", () => {
  beforeEach(() => {
    delete process.env.TEST_WITH_SUPABASE;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("is false when TEST_WITH_SUPABASE is unset", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://real.supabase.co";
    expect(await loadGate()).toBe(false);
  });

  it("is false when NEXT_PUBLIC_SUPABASE_URL is unset", async () => {
    process.env.TEST_WITH_SUPABASE = "1";
    expect(await loadGate()).toBe(false);
  });

  it("is false when NEXT_PUBLIC_SUPABASE_URL is a placeholder", async () => {
    process.env.TEST_WITH_SUPABASE = "1";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://placeholder.supabase.co";
    expect(await loadGate()).toBe(false);
  });

  it("is false when TEST_WITH_SUPABASE is set to anything other than '1'", async () => {
    process.env.TEST_WITH_SUPABASE = "true";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://real.supabase.co";
    expect(await loadGate()).toBe(false);
  });

  it("is true when both conditions are satisfied", async () => {
    process.env.TEST_WITH_SUPABASE = "1";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://real.supabase.co";
    expect(await loadGate()).toBe(true);
  });
});
