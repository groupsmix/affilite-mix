/**
 * Unit tests for resolveSlotImageAd — the shared resolver behind the public
 * AdSlot and the article sidebar. It must pick the highest-priority renderable
 * image placement, skip non-image/incomplete placements, and fail open (return
 * null) when the database is unreachable.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AdPlacementRow } from "@/types/database";

const R2 = "https://cdn.example.r2.dev";

const listActiveAdPlacements = vi.fn();
const shouldSkipDbCall = vi.fn();

vi.mock("@/lib/dal/ad-placements", () => ({
  listActiveAdPlacements: (...args: unknown[]) => listActiveAdPlacements(...args),
}));
vi.mock("@/lib/db-available", () => ({
  shouldSkipDbCall: () => shouldSkipDbCall(),
}));

function placement(overrides: Partial<AdPlacementRow>): AdPlacementRow {
  return {
    id: "p1",
    site_id: "s1",
    name: "n",
    placement_type: "sidebar",
    provider: "image",
    ad_code: null,
    config: {},
    is_active: true,
    priority: 0,
    created_at: new Date().toISOString(),
    ...overrides,
  } as AdPlacementRow;
}

async function importResolver() {
  const mod = await import("@/app/(public)/components/ads/ad-slot");
  return mod.resolveSlotImageAd;
}

describe("resolveSlotImageAd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.R2_PUBLIC_URL = R2;
    shouldSkipDbCall.mockReturnValue(false);
  });

  it("returns null without hitting the DB when db calls are skipped", async () => {
    shouldSkipDbCall.mockReturnValue(true);
    const resolveSlotImageAd = await importResolver();
    const result = await resolveSlotImageAd("s1", "sidebar");
    expect(result).toBeNull();
    expect(listActiveAdPlacements).not.toHaveBeenCalled();
  });

  it("returns the first renderable image placement, skipping incomplete ones", async () => {
    listActiveAdPlacements.mockResolvedValue([
      placement({ id: "incomplete", config: {} }),
      placement({
        id: "good",
        config: { image_url: `${R2}/a.jpg`, click_url: "https://x.example.com", alt: "a" },
      }),
    ]);
    const resolveSlotImageAd = await importResolver();
    const result = await resolveSlotImageAd("s1", "sidebar");
    expect(result).toEqual({
      placementId: "good",
      config: { image_url: `${R2}/a.jpg`, click_url: "https://x.example.com", alt: "a" },
    });
  });

  it("returns null when no placement is renderable", async () => {
    listActiveAdPlacements.mockResolvedValue([
      placement({ provider: "adsense", ad_code: "<script>", config: {} }),
    ]);
    const resolveSlotImageAd = await importResolver();
    expect(await resolveSlotImageAd("s1", "between_posts")).toBeNull();
  });

  it("fails open (null) when the placement lookup throws", async () => {
    listActiveAdPlacements.mockRejectedValue(new Error("db down"));
    const resolveSlotImageAd = await importResolver();
    expect(await resolveSlotImageAd("s1", "footer")).toBeNull();
  });
});
