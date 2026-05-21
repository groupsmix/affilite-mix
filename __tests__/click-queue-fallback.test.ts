import { describe, it, expect, vi, beforeEach } from "vitest";
import { publishClick } from "@/lib/click-queue";
import { captureException } from "@/lib/sentry";

const mockInsert = {
  unsafeNoSiteFilter: vi.fn().mockResolvedValue({ error: null }),
};
const mockFrom = vi.fn().mockReturnValue({
  insert: vi.fn().mockReturnValue(mockInsert),
});
const mockSb = { from: mockFrom };

vi.mock("@/lib/server-only/service-role", () => ({
  getPrivilegedSupabaseClient: () => mockSb,
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 10, retryAfterMs: 0 }),
}));

describe("click-queue fallback", () => {
  beforeEach(() => {
    vi.stubGlobal("CLICK_QUEUE", undefined);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    vi.clearAllMocks();
  });

  it("drops click and logs to Sentry when queue.send fails in production", async () => {
    const mockQueue = {
      send: vi.fn().mockRejectedValue(new Error("Queue full")),
      sendBatch: vi.fn(),
    };
    vi.stubGlobal("CLICK_QUEUE", mockQueue);

    const input = {
      site_id: "site-1",
      product_id: "prod-1",
      url: "https://affiliate.com/1",
      user_agent: "test-ua",
      ip_address: "1.2.3.4",
    };

    await publishClick(input);

    expect(mockQueue.send).toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ context: "click-queue.log-failure" })
    );
  });
});
