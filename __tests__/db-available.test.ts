/**
 * PROD-INCIDENT-2026-06-11 regression test.
 *
 * `shouldSkipDbCall()` previously returned `true` on every production
 * request because `isBuildPhase()` was using `!!process.env.NEXT_PHASE`
 * instead of comparing against the exact `phase-production-build` constant.
 * The deployed Worker runtime also defines `NEXT_PHASE`, so every guarded
 * DAL helper silently returned empty and all four public sites rendered
 * contentless shells for ~12 days.
 *
 * These tests pin the runtime/build-phase distinction so the regression
 * cannot reappear unnoticed.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

import { isSupabaseConfigured, shouldSkipDbCall } from "@/lib/db-available";

const REAL_SUPABASE_URL = "https://example.supabase.co";

describe("lib/db-available", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = REAL_SUPABASE_URL;
    delete process.env.NEXT_PHASE;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("isSupabaseConfigured", () => {
    it("returns false when URL is unset", () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      expect(isSupabaseConfigured()).toBe(false);
    });

    it("returns false when URL is empty", () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "";
      expect(isSupabaseConfigured()).toBe(false);
    });

    it("returns false when URL contains the placeholder sentinel", () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://placeholder.supabase.co";
      expect(isSupabaseConfigured()).toBe(false);
    });

    it("returns true for a real-looking URL", () => {
      expect(isSupabaseConfigured()).toBe(true);
    });
  });

  describe("shouldSkipDbCall (PROD-INCIDENT-2026-06-11 regression)", () => {
    it("skips during next build (NEXT_PHASE === phase-production-build)", () => {
      process.env.NEXT_PHASE = PHASE_PRODUCTION_BUILD;
      expect(shouldSkipDbCall()).toBe(true);
    });

    it("DOES NOT skip at production-server runtime (NEXT_PHASE === phase-production-server)", () => {
      // This is the exact value the deployed Worker runtime sets.
      // The pre-fix code used `!!process.env.NEXT_PHASE` which made this
      // return `true` and silently broke every public page.
      process.env.NEXT_PHASE = "phase-production-server";
      expect(shouldSkipDbCall()).toBe(false);
    });

    it("DOES NOT skip during dev-server runtime (NEXT_PHASE === phase-development-server)", () => {
      process.env.NEXT_PHASE = "phase-development-server";
      expect(shouldSkipDbCall()).toBe(false);
    });

    it("DOES NOT skip when NEXT_PHASE is unset (typical Worker invocation)", () => {
      expect(shouldSkipDbCall()).toBe(false);
    });

    it("DOES NOT skip for an unknown future NEXT_PHASE value (fail-open at runtime)", () => {
      // If Next.js ever introduces a new phase we haven't seen, prefer to
      // attempt the DB call rather than silently render empty.
      process.env.NEXT_PHASE = "phase-future-unknown";
      expect(shouldSkipDbCall()).toBe(false);
    });

    it("still skips when Supabase is not configured, regardless of phase", () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      expect(shouldSkipDbCall()).toBe(true);

      process.env.NEXT_PHASE = "phase-production-server";
      expect(shouldSkipDbCall()).toBe(true);
    });
  });
});
