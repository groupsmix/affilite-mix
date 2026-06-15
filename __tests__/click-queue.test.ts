import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/dal/affiliate-clicks", () => ({
  recordClick: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/metrics", () => ({
  emitMetric: vi.fn(),
}));

vi.mock("@/lib/server-only/service-role", () => ({
  getPrivilegedSupabaseClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        unsafeNoSiteFilter: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  })),
}));

describe("F-028 click-queue producer", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("falls back to recordClick when CLICK_QUEUE is not bound", async () => {
    const { publishClick } = await import("@/lib/click-queue");
    const { recordClick } = await import("@/lib/dal/affiliate-clicks");

    await publishClick({
      site_id: "site-1",
      product_name: "Widget",
      affiliate_url: "https://example.com/aff",
    });

    expect(recordClick).toHaveBeenCalledTimes(1);
    const arg = (recordClick as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(arg).toMatchObject({
      site_id: "site-1",
      product_name: "Widget",
      affiliate_url: "https://example.com/aff",
    });
    expect(typeof arg.click_id).toBe("string");
  });

  it("publishes to the queue when CLICK_QUEUE is bound", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("CLICK_QUEUE", { send, sendBatch: vi.fn() });

    const { publishClick } = await import("@/lib/click-queue");
    const { recordClick } = await import("@/lib/dal/affiliate-clicks");

    await publishClick({
      site_id: "site-1",
      product_name: "Widget",
      affiliate_url: "https://example.com/aff",
      content_slug: "review",
      referrer: "https://google.com",
    });

    expect(send).toHaveBeenCalledTimes(1);
    const msg = send.mock.calls[0]![0];
    expect(msg).toMatchObject({
      site_id: "site-1",
      product_name: "Widget",
      affiliate_url: "https://example.com/aff",
      content_slug: "review",
      referrer: "https://google.com",
    });
    expect(typeof msg.ts).toBe("number");
    expect(typeof msg.click_id).toBe("string");
    expect(recordClick).not.toHaveBeenCalled();
  });

  it("generates a click_id when none is provided", async () => {
    const { publishClick } = await import("@/lib/click-queue");
    const { recordClick } = await import("@/lib/dal/affiliate-clicks");

    await publishClick({
      site_id: "site-1",
      product_name: "Widget",
      affiliate_url: "https://example.com/aff",
    });

    const arg = (recordClick as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(arg.click_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("ignores caller-supplied click_id and generates a server-side one (F-BIZ-01)", async () => {
    const { publishClick } = await import("@/lib/click-queue");
    const { recordClick } = await import("@/lib/dal/affiliate-clicks");

    const callerSupplied = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    await publishClick({
      site_id: "site-1",
      product_name: "Widget",
      affiliate_url: "https://example.com/aff",
      click_id: callerSupplied,
    });

    const arg = (recordClick as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    // F-BIZ-01: client-supplied click_id must be ignored to prevent
    // replay/suppression attacks. The producer generates a fresh UUID.
    expect(arg.click_id).not.toBe(callerSupplied);
    expect(arg.click_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("falls through to direct write when queue send throws", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("CLICK_QUEUE", {
      send: vi.fn().mockRejectedValue(new Error("queue down")),
      sendBatch: vi.fn(),
    });

    const { publishClick } = await import("@/lib/click-queue");
    const { recordClick } = await import("@/lib/dal/affiliate-clicks");

    // resetModules above gives us a fresh mock; assert this call produced one hit.
    const publishPromise = publishClick({
      site_id: "site-1",
      product_name: "Widget",
      affiliate_url: "https://example.com/aff",
    });
    await vi.runAllTimersAsync();
    await publishPromise;

    expect(recordClick).toHaveBeenCalledTimes(1);
  });

  it("retries queue send with backoff before falling back in non-production", async () => {
    vi.useFakeTimers();
    const send = vi.fn().mockRejectedValue(new Error("queue down"));
    vi.stubGlobal("CLICK_QUEUE", {
      send,
      sendBatch: vi.fn(),
    });

    const { publishClick } = await import("@/lib/click-queue");
    const { recordClick } = await import("@/lib/dal/affiliate-clicks");

    const publishPromise = publishClick({
      site_id: "site-1",
      product_name: "Widget",
      affiliate_url: "https://example.com/aff",
    });
    await vi.runAllTimersAsync();
    await publishPromise;

    expect(send).toHaveBeenCalledTimes(3);
    expect(recordClick).toHaveBeenCalledTimes(1);
  });

  it("alerts and skips direct write in production after total queue loss", async () => {
    vi.useFakeTimers();
    vi.stubEnv("NODE_ENV", "production");
    const send = vi.fn().mockRejectedValue(new Error("queue down"));
    vi.stubGlobal("CLICK_QUEUE", {
      send,
      sendBatch: vi.fn(),
    });

    const { publishClick } = await import("@/lib/click-queue");
    const { recordClick } = await import("@/lib/dal/affiliate-clicks");
    const { captureException } = await import("@/lib/sentry");
    const { emitMetric } = await import("@/lib/metrics");

    const publishPromise = publishClick({
      site_id: "site-1",
      product_name: "Widget",
      affiliate_url: "https://example.com/aff",
    });
    await vi.runAllTimersAsync();
    await publishPromise;

    expect(send).toHaveBeenCalledTimes(3);
    expect(recordClick).not.toHaveBeenCalled();
    expect(emitMetric).toHaveBeenCalledWith(
      "click_queue_total_loss",
      1,
      expect.objectContaining({ site_id: "site-1", error_type: "queue_send_failed" }),
    );
    expect(
      (captureException as ReturnType<typeof vi.fn>).mock.calls.some(
        ([, ctx]) => (ctx as { context?: string } | undefined)?.context === "click-queue.total-loss",
      ),
    ).toBe(true);
  });
});
