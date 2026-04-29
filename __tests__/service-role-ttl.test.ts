/**
 * G-30: TTL cap on the privileged service-role client cache.
 *
 * The privileged client is memoised per Worker isolate, but the cache must
 * expire so that long-lived isolates pick up rotated `SUPABASE_SERVICE_ROLE_KEY`
 * values without requiring a redeploy. These tests pin down both the
 * within-TTL fast path and the post-TTL / env-changed re-read paths.
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

  it("returns the same instance within the 5-minute TTL window", () => {
    const a = getPrivilegedSupabaseClient();
    vi.advanceTimersByTime(60_000);
    const b = getPrivilegedSupabaseClient();
    expect(a).toBe(b);
  });

  it("forces a re-read of process.env after the TTL expires even if the env is unchanged", () => {
    const a = getPrivilegedSupabaseClient();

    // 4m59s — still within the TTL, cached client wins.
    vi.advanceTimersByTime(5 * 60 * 1000 - 1_000);
    const stillCached = getPrivilegedSupabaseClient();
    expect(stillCached).toBe(a);

    // Cross the 5-minute boundary: next call must re-read env and mint
    // a fresh client even though no rotation has happened yet. This is
    // the contract the audit recommendation pins down — the cache must
    // not outlive a rotation indefinitely.
    vi.advanceTimersByTime(2_000);
    const refreshed = getPrivilegedSupabaseClient();
    expect(refreshed).not.toBe(a);
  });

  it("rebuilds immediately when the env value changes within the TTL window", () => {
    const a = getPrivilegedSupabaseClient();

    // Defence-in-depth: a `wrangler deploy` rollout that follows a
    // `wrangler secret put` rotation should not have to wait out the
    // TTL — if the env value changed, the next call rebuilds.
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key-v2");
    vi.advanceTimersByTime(1_000);

    const rotated = getPrivilegedSupabaseClient();
    expect(rotated).not.toBe(a);
  });
});
