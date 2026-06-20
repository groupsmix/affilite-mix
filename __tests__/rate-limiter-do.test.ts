import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { RateLimiterDO } from "@/workers/rate-limiter-do";

/**
 * Bug 8 — the fixed-window roll must reset the counter at a window boundary
 * from the in-band increment() path, NOT only from the cleanup alarm.
 *
 * Before the fix, `storedWindow = get(WINDOW_KEY) ?? windowId` meant the key
 * was never persisted on first sight, so `storedWindow !== windowId` was
 * unreachable and the documented roll was dead code. These tests drive
 * increment() (via the public fetch contract) across two windowIds *without*
 * ever invoking alarm(), so any reset they observe comes purely from the roll.
 */

// Minimal in-memory implementation of the DO storage + state contract. The
// alarm is recorded but never auto-fired.
function makeState() {
  const map = new Map<string, unknown>();
  let alarmAt: number | null = null;
  return {
    map,
    get alarmAt() {
      return alarmAt;
    },
    storage: {
      get: async <T>(key: string): Promise<T | undefined> => map.get(key) as T | undefined,
      put: async <T>(key: string, value: T): Promise<void> => {
        map.set(key, value);
      },
      delete: async (key: string): Promise<boolean> => map.delete(key),
      setAlarm: async (scheduledTime: number | Date): Promise<void> => {
        alarmAt = scheduledTime instanceof Date ? scheduledTime.getTime() : scheduledTime;
      },
    },
    blockConcurrencyWhile: <T>(fn: () => Promise<T>): Promise<T> => fn(),
  };
}

type State = ReturnType<typeof makeState>;
type DOCtorArg = ConstructorParameters<typeof RateLimiterDO>[0];

interface CheckResponseBody {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

async function check(
  limiter: RateLimiterDO,
  body: { key: string; maxRequests: number; windowMs: number },
): Promise<CheckResponseBody> {
  const res = await limiter.fetch(
    new Request("https://do.internal/check", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
  return (await res.json()) as CheckResponseBody;
}

describe("Bug 8: RateLimiterDO fixed-window roll", () => {
  let state: State;
  let limiter: RateLimiterDO;
  let nowMs: number;

  const WINDOW_MS = 60_000;

  beforeEach(() => {
    nowMs = 0;
    vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    state = makeState();
    limiter = new RateLimiterDO(state as unknown as DOCtorArg);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resets the count at the window boundary without firing the alarm", async () => {
    const MAX = 2;

    // ---- Window 0 (windowId = floor(0 / 60000) = 0) ----
    nowMs = 0;

    expect(await check(limiter, { key: "k", maxRequests: MAX, windowMs: WINDOW_MS })).toEqual({
      allowed: true,
      remaining: 1,
      retryAfterMs: 0,
    });
    expect(await check(limiter, { key: "k", maxRequests: MAX, windowMs: WINDOW_MS })).toEqual({
      allowed: true,
      remaining: 0,
      retryAfterMs: 0,
    });

    // Third request in the same window is over the limit.
    const blocked = await check(limiter, { key: "k", maxRequests: MAX, windowMs: WINDOW_MS });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);

    // The bootstrap fix: WINDOW_KEY is persisted on first sight (and is the
    // numeric bucket 0 — proving we distinguish "unset" from a falsy 0).
    expect(state.map.get("windowStart")).toBe(0);
    expect(state.map.get("count")).toBe(2);

    // ---- Window 1: cross the boundary WITHOUT firing the alarm ----
    // windowId = floor(60000 / 60000) = 1
    nowMs = WINDOW_MS;

    const rolled = await check(limiter, { key: "k", maxRequests: MAX, windowMs: WINDOW_MS });
    // With the bug the count never reset and this stays blocked; with the fix
    // the in-band roll resets count to 0 and the request is allowed again.
    expect(rolled).toEqual({ allowed: true, remaining: 1, retryAfterMs: 0 });

    // Stored window advanced and the counter restarted in the new bucket.
    expect(state.map.get("windowStart")).toBe(1);
    expect(state.map.get("count")).toBe(1);
  });

  it("persists WINDOW_KEY on the very first request (no bootstrap deadlock)", async () => {
    nowMs = 5 * WINDOW_MS; // windowId = 5

    await check(limiter, { key: "k", maxRequests: 10, windowMs: WINDOW_MS });

    // Before the fix this key was never written on first sight, so the roll
    // comparison could never fire on a subsequent window.
    expect(state.map.get("windowStart")).toBe(5);
    // The alarm is still scheduled as pure cleanup, untouched by the fix.
    expect(state.alarmAt).toBe(6 * WINDOW_MS + 1000);
  });
});
