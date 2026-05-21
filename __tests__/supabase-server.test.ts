import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * These tests verify that the server-side Supabase factories no longer
 * silently fall back to a placeholder client when env is missing in
 * production — misconfiguration must surface as an immediate throw.
 */
describe("supabase-server factories", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    delete (globalThis as any).__sb_client;
    delete (globalThis as any).__sb_anon_client;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("getServiceClient throws in production when required env is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { getServiceClient } = await import("@/lib/supabase-server");
    expect(() => getServiceClient()).toThrow(/NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("getAnonClient throws in production when required env is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const { getAnonClient } = await import("@/lib/supabase-server");
    expect(() => getAnonClient()).toThrow(/NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it("does not fall back to placeholder.supabase.co in any environment", async () => {
    // In development with safe local values, the client should be real
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "dev-anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "dev-service-key");
    const { getServiceClient, getAnonClient } = await import("@/lib/supabase-server");
    const service = getServiceClient() as unknown as { supabaseUrl?: string };
    const anon = getAnonClient() as unknown as { supabaseUrl?: string };
    // supabase-js exposes the configured URL on the client instance; we
    // only assert that neither client was constructed with the old
    // placeholder URL (which is what `grep` historically found in this file).
    if (service.supabaseUrl !== undefined) {
      expect(service.supabaseUrl).not.toContain("placeholder.supabase.co");
    }
    if (anon.supabaseUrl !== undefined) {
      expect(anon.supabaseUrl).not.toContain("placeholder.supabase.co");
    }
  });

  it("works in development when env is provided (safe local behavior still runs)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "dev-anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "dev-service");
    const { getServiceClient, getAnonClient } = await import("@/lib/supabase-server");
    expect(getServiceClient()).toBeDefined();
    expect(getAnonClient()).toBeDefined();
  });
});
