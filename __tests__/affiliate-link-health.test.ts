import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/cron-auth", () => ({
  verifyCronAuth: vi.fn(() => false),
}));
vi.mock("@/lib/cron-registry", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cron-registry")>("@/lib/cron-registry");
  return actual;
});

import { NextRequest } from "next/server";
import {
  classifyProbe,
  nextHealthCursor,
  sendAlerts,
  shouldAlert,
  HEALTH_TARGET_BATCH_SIZE,
} from "@/lib/affiliate-link-health-monitor";
import { POST } from "@/app/api/cron/affiliate-link-health/route";

describe("affiliate link health classification", () => {
  beforeEach(() => {
    vi.stubEnv("AFFILIATE_DOMAIN_ENFORCEMENT", "strict");
    vi.stubEnv("AMAZON_ASSOCIATE_TAG", "ours-20");
  });

  it("classifies a reachable allowlisted destination as healthy", () => {
    expect(
      classifyProbe(
        "https://amazon.com/dp/ABC?tag=ours-20",
        { status: 200, finalUrl: "https://www.amazon.com/dp/ABC?tag=ours-20" },
        "amazon",
      ),
    ).toBe("healthy");
  });

  it("classifies HTTP failures as broken", () => {
    expect(
      classifyProbe("https://amazon.com/dp/ABC", { status: 404, finalUrl: null }, "amazon"),
    ).toBe("broken");
    expect(
      classifyProbe(
        "https://amazon.com/dp/ABC",
        { status: null, finalUrl: null, error: "timeout" },
        "amazon",
      ),
    ).toBe("broken");
  });

  it("uses the first successful landing domain as the baseline", () => {
    expect(
      classifyProbe(
        "https://amazon.com/dp/ABC?tag=ours-20",
        { status: 200, finalUrl: "https://competitor.example/product" },
        "amazon",
        "amazon.com",
      ),
    ).toBe("suspicious");
    expect(
      classifyProbe(
        "https://amazon.com/dp/ABC?tag=ours-20",
        { status: 200, finalUrl: "https://merchant.example/product" },
        "amazon",
      ),
    ).toBe("healthy");
  });

  it("classifies a foreign publisher tag as suspicious", () => {
    expect(
      classifyProbe(
        "https://amazon.com/dp/ABC?tag=ours-20",
        { status: 200, finalUrl: "https://amazon.com/dp/ABC?tag=competitor-20" },
        "amazon",
      ),
    ).toBe("suspicious");
  });
});

describe("affiliate link health streaks and cursor", () => {
  it("alerts immediately for suspicious links and at the broken threshold only", () => {
    expect(shouldAlert(null, "suspicious", 0)).toBe(true);
    expect(
      shouldAlert({ classification: "suspicious", consecutive_failures: 0 }, "suspicious", 0),
    ).toBe(false);
    expect(shouldAlert(null, "broken", 2)).toBe(false);
    expect(shouldAlert(null, "broken", 3)).toBe(true);
    expect(shouldAlert({ classification: "broken", consecutive_failures: 3 }, "broken", 4)).toBe(
      false,
    );
  });

  it("advances across a full batch and resets after the final partial page", () => {
    expect(nextHealthCursor(null, "product-a:link:1", HEALTH_TARGET_BATCH_SIZE, true)).toBe(
      "product-a:link:1",
    );
    expect(nextHealthCursor("old", "product-b:primary", 3, false)).toBeNull();
    expect(nextHealthCursor("old", null, 0, true)).toBeNull();
  });
});

describe("affiliate link health cron authentication", () => {
  it("rejects requests without the cron secret", async () => {
    const response = await POST(
      new NextRequest("https://example.com/api/cron/affiliate-link-health"),
    );
    expect(response.status).toBe(401);
  });

  it("completes without email configuration", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("NEWSLETTER_FROM_EMAIL", "");
    vi.stubEnv("AFFILIATE_HEALTH_ALERT_EMAIL", "");
    await expect(
      sendAlerts([
        {
          target: {
            key: "product:primary",
            product: {
              id: "p",
              site_id: "s",
              name: "Example",
              affiliate_url: "https://amazon.com",
            },
            linkId: null,
            network: "amazon",
            url: "https://amazon.com",
          },
          result: {
            classification: "suspicious",
            status: 200,
            finalUrl: "https://competitor.example",
            latencyMs: 10,
            error: null,
          },
          streak: 0,
        },
      ]),
    ).resolves.toBeUndefined();
  });
});
