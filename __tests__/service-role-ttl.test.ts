/**
 * G-30 / C-7: TTL cap on the privileged service-role client cache.
 *
 * The privileged client is memoised per Worker isolate, but the cache must
 * expire so that long-lived isolates pick up rotated `SUPABASE_SERVICE_ROLE_KEY`
 * values without requiring a redeploy. C-7 tightened the TTL from 5 min to 60s.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getPrivilegedSupabaseClient,
  __resetPrivilegedSupabaseClientForTests,
} from "@/lib/server-only/service-role";

describe("G-30: privileged Supabase client TTL", () => {
  beforeEach(() => {
    __resetPrivilegedSupabaseClientForTests();
    vi.useFakeTimers();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://staging.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key-v1");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    __resetPrivilegedSupabaseClientForTests();
  });

  it("returns the same instance within the 60s TTL window", () => {
    const a = getPrivilegedSupabaseClient();
    vi.advanceTimersByTime(30_000);
    const b = getPrivilegedSupabaseClient();
    expect(a).toBe(b);
  });

  it("forces a re-read of process.env after the TTL expires even if the env is unchanged", () => {
    const a = getPrivilegedSupabaseClient();

    // 59s — still within the TTL, cached client wins.
    vi.advanceTimersByTime(59_000);
    const stillCached = getPrivilegedSupabaseClient();
    expect(stillCached).toBe(a);

    // Cross the 60s boundary: next call must re-read env and mint
    // a fresh client even though no rotation has happened yet.
    vi.advanceTimersByTime(2_000);
    const refreshed = getPrivilegedSupabaseClient();
    expect(refreshed).not.toBe(a);
  });

  it("rebuilds immediately when the env value changes within the TTL window", () => {
    const a = getPrivilegedSupabaseClient();

    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key-v2");
    vi.advanceTimersByTime(1_000);

    const rotated = getPrivilegedSupabaseClient();
    expect(rotated).not.toBe(a);
  });
});
