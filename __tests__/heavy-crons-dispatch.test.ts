/**
 * P1-5: heavy-cron dispatcher retry/backoff + terminal propagation.
 *
 * Cloudflare cron triggers do NOT auto-retry the way Queues do, so the
 * dispatcher retries transient failures itself with bounded exponential
 * backoff and, on terminal failure, both alerts (captureException) and
 * rejects the scheduled promise so the invocation is marked failed.
 *
 * These are behavioural tests: they drive the real `scheduled()` handler
 * with a mocked `fetch` rather than asserting on source text.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@sentry/cloudflare", () => ({ captureException: vi.fn() }));
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { captureException } from "@sentry/cloudflare";
import worker from "../workers/heavy-crons";

const captureExceptionMock = vi.mocked(captureException);

// ai-generate is a HEAVY job on schedule "0 2 * * *" (see lib/cron-registry.ts).
const HEAVY_CRON = "0 2 * * *";

const controller = { cron: HEAVY_CRON, scheduledTime: Date.now() };
const env = { CRON_HOST: "https://app.example.com", CRON_AI_SECRET: "secret-token" };
const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() };

function response(status: number, body = "ok") {
  return { ok: status >= 200 && status < 300, status, text: async () => body } as Response;
}

function run() {
  return worker.scheduled(controller as never, env as never, ctx as never) as Promise<void>;
}

beforeEach(() => {
  captureExceptionMock.mockClear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("heavy-crons dispatch retry/backoff", () => {
  it("retries a transient 500 and succeeds without alerting", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(500, "boom"))
      .mockResolvedValueOnce(response(500, "boom"))
      .mockResolvedValueOnce(response(200, "done"));
    vi.stubGlobal("fetch", fetchMock);

    const p = run();
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("propagates a terminal failure after exhausting retries and alerts once", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(503, "still down"));
    vi.stubGlobal("fetch", fetchMock);

    const p = run();
    // Attach a rejection handler up-front so the fake-timer flush does not
    // surface an unhandled rejection while backoff timers advance.
    const settled = p.then(
      () => "resolved",
      (e: Error) => e,
    );
    await vi.runAllTimersAsync();
    const result = await settled;

    expect(result).toBeInstanceOf(Error);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it("fails fast on a non-retryable 401 without retrying", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(401, "unauthorized"));
    vi.stubGlobal("fetch", fetchMock);

    const p = run();
    const settled = p.then(
      () => "resolved",
      (e: Error) => e,
    );
    await vi.runAllTimersAsync();
    const result = await settled;

    expect(result).toBeInstanceOf(Error);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it("retries network errors then alerts on terminal failure", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const p = run();
    const settled = p.then(
      () => "resolved",
      (e: Error) => e,
    );
    await vi.runAllTimersAsync();
    const result = await settled;

    expect(result).toBeInstanceOf(Error);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });
});
