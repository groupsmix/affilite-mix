/**
 * Behavior tests for `lib/security/unknown-host-guard.ts` (G-34).
 *
 * Covers:
 *   - Negative-cache TTL ramp: 300 → 600 → 1200 → 2400 → 3600s, capped.
 *   - Worker-wide LRU cap: ≤100 distinct unknown hosts per rolling 1s
 *     window, with already-seen hosts always allowed within the window.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getNegativeCacheTtlSeconds,
  recordUnknownHostKvAccess,
  _resetUnknownHostGuardForTests,
} from "@/lib/security/unknown-host-guard";

describe("getNegativeCacheTtlSeconds — TTL ramp", () => {
  it("first miss returns the 5-minute floor", () => {
    expect(getNegativeCacheTtlSeconds(1)).toBe(300);
  });

  it("doubles on each subsequent miss until the 1-hour cap", () => {
    expect(getNegativeCacheTtlSeconds(2)).toBe(600);
    expect(getNegativeCacheTtlSeconds(3)).toBe(1200);
    expect(getNegativeCacheTtlSeconds(4)).toBe(2400);
  });

  it("caps at 3600s for any miss count past the ramp", () => {
    expect(getNegativeCacheTtlSeconds(5)).toBe(3600);
    expect(getNegativeCacheTtlSeconds(50)).toBe(3600);
    expect(getNegativeCacheTtlSeconds(1_000_000)).toBe(3600);
  });

  it("treats 0 / negatives / non-integers as a first miss", () => {
    expect(getNegativeCacheTtlSeconds(0)).toBe(300);
    expect(getNegativeCacheTtlSeconds(-7)).toBe(300);
    expect(getNegativeCacheTtlSeconds(1.9)).toBe(300);
  });
});

describe("recordUnknownHostKvAccess — worker-wide LRU cap", () => {
  beforeEach(() => {
    _resetUnknownHostGuardForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows the first 100 distinct hosts within the same window", () => {
    for (let i = 0; i < 100; i++) {
      expect(recordUnknownHostKvAccess(`host-${i}.example.com`).allowed).toBe(true);
    }
  });

  it("rejects the 101st distinct host within the same window", () => {
    for (let i = 0; i < 100; i++) {
      recordUnknownHostKvAccess(`host-${i}.example.com`);
    }
    expect(recordUnknownHostKvAccess("host-flood.example.com").allowed).toBe(false);
  });

  it("always allows a host already seen within the window (refreshes recency)", () => {
    for (let i = 0; i < 100; i++) {
      recordUnknownHostKvAccess(`host-${i}.example.com`);
    }
    // host-0 is already inside the window, even though we're at the cap.
    expect(recordUnknownHostKvAccess("host-0.example.com").allowed).toBe(true);
    // But a *new* host still gets blocked.
    expect(recordUnknownHostKvAccess("host-101.example.com").allowed).toBe(false);
  });

  it("admits new hosts again once the 1s window elapses", () => {
    for (let i = 0; i < 100; i++) {
      recordUnknownHostKvAccess(`host-${i}.example.com`);
    }
    // We're at the cap — a brand-new host is blocked.
    expect(recordUnknownHostKvAccess("host-100.example.com").allowed).toBe(false);

    // Advance past the rolling window so all entries expire.
    vi.advanceTimersByTime(1500);

    // The cap resets — new hosts are admitted again.
    expect(recordUnknownHostKvAccess("host-100.example.com").allowed).toBe(true);
  });

  it("refreshing a known host keeps it inside the window (LRU recency)", () => {
    recordUnknownHostKvAccess("first.example.com");
    // 800 ms later, refresh — well under the 1s window.
    vi.advanceTimersByTime(800);
    expect(recordUnknownHostKvAccess("first.example.com").allowed).toBe(true);

    // Another 800 ms — total 1600 ms since the first access, but only
    // 800 ms since the refresh, so the entry is still live.
    vi.advanceTimersByTime(800);
    // Fill the rest of the cap with NEW hosts (99 of them).
    for (let i = 0; i < 99; i++) {
      recordUnknownHostKvAccess(`host-${i}.example.com`);
    }
    // We're at the cap (1 refreshed + 99 new = 100). A 101st *new*
    // host must be rejected.
    expect(recordUnknownHostKvAccess("host-flood.example.com").allowed).toBe(false);
  });
});
