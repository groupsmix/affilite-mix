import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/dal/affiliate-clicks", () => ({
  recordClick: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

describe("F-028 click-queue producer", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
    const arg = (recordClick as ReturnType<typeof vi.fn>).mock.calls[0][0];
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
    const msg = send.mock.calls[0][0];
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

    const arg = (recordClick as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.click_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("preserves a caller-supplied click_id", async () => {
    const { publishClick } = await import("@/lib/click-queue");
    const { recordClick } = await import("@/lib/dal/affiliate-clicks");

    await publishClick({
      site_id: "site-1",
      product_name: "Widget",
      affiliate_url: "https://example.com/aff",
      click_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    });

    const arg = (recordClick as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.click_id).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  });

  it("falls through to direct write when queue send throws", async () => {
    vi.stubGlobal("CLICK_QUEUE", {
      send: vi.fn().mockRejectedValue(new Error("queue down")),
      sendBatch: vi.fn(),
    });

    const { publishClick } = await import("@/lib/click-queue");
    const { recordClick } = await import("@/lib/dal/affiliate-clicks");

    // resetModules above gives us a fresh mock; assert this call produced one hit.
    await publishClick({
      site_id: "site-1",
      product_name: "Widget",
      affiliate_url: "https://example.com/aff",
    });

    expect(recordClick).toHaveBeenCalledTimes(1);
  });
});
