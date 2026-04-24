/**
 * Integration test: Ad impression tracking under concurrency
 *
 * This test verifies that the atomic upsert implementation correctly
 * handles concurrent impression tracking without losing counts.
 *
 * Tests the fix for Issue #4 (atomic impression aggregation).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getServiceClient } from "@/lib/supabase-server";
import { recordAdImpression } from "@/lib/dal/ad-impressions";
import { shouldRunSupabaseIntegration } from "./helpers/should-run";

describe.skipIf(!shouldRunSupabaseIntegration)("Impression Tracking Integration", () => {
  const sb = getServiceClient();
  let testSiteId: string;
  let testPlacementId: string;

  beforeEach(async () => {
    // Create a test site
    const { data: site, error: siteError } = await sb
      .from("sites")
      .insert({
        slug: `test-impressions-${Date.now()}`,
        name: "Test Impressions Site",
        domain: `test-impressions-${Date.now()}.test`,
        language: "en",
        direction: "ltr",
      })
      .select()
      .single();

    if (siteError) throw siteError;
    testSiteId = site.id;

    // Create a test ad placement
    const { data: placement, error: placementError } = await sb
      .from("ad_placements")
      .insert({
        site_id: testSiteId,
        name: "Test Sidebar Ad",
        placement_type: "sidebar",
        provider: "adsense",
        is_active: true,
      })
      .select()
      .single();

    if (placementError) throw placementError;
    testPlacementId = placement.id;
  });

  afterEach(async () => {
    // Cleanup: delete test site (cascade deletes placements and impressions)
    await sb.from("sites").delete().eq("id", testSiteId);
  });

  it("should handle concurrent impressions without losing counts", async () => {
    const pagePath = "/test-page";
    const concurrentRequests = 50;

    // Simulate 50 concurrent impression tracking calls
    const promises = Array.from({ length: concurrentRequests }, () =>
      recordAdImpression(testSiteId, testPlacementId, pagePath),
    );

    await Promise.all(promises);

    // Wait a bit for all writes to complete
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify the final count is exactly 50
    const today = new Date().toISOString().split("T")[0];
    const { data: impression } = await sb
      .from("ad_impressions")
      .select("impression_count")
      .eq("site_id", testSiteId)
      .eq("ad_placement_id", testPlacementId)
      .eq("page_path", pagePath)
      .eq("impression_date", today)
      .single();

    // With atomic upsert, we should have exactly 50 impressions
    // Without it, we'd likely have fewer due to race conditions
    expect(impression?.impression_count).toBe(concurrentRequests);
  });

  it("should track impressions separately by page path", async () => {
    const page1 = "/page-1";
    const page2 = "/page-2";

    // Record impressions on different pages
    await recordAdImpression(testSiteId, testPlacementId, page1);
    await recordAdImpression(testSiteId, testPlacementId, page1);
    await recordAdImpression(testSiteId, testPlacementId, page2);

    await new Promise((resolve) => setTimeout(resolve, 500));

    const today = new Date().toISOString().split("T")[0];

    // Check page 1 count
    const { data: page1Impression } = await sb
      .from("ad_impressions")
      .select("impression_count")
      .eq("site_id", testSiteId)
      .eq("ad_placement_id", testPlacementId)
      .eq("page_path", page1)
      .eq("impression_date", today)
      .single();

    expect(page1Impression?.impression_count).toBe(2);

    // Check page 2 count
    const { data: page2Impression } = await sb
      .from("ad_impressions")
      .select("impression_count")
      .eq("site_id", testSiteId)
      .eq("ad_placement_id", testPlacementId)
      .eq("page_path", page2)
      .eq("impression_date", today)
      .single();

    expect(page2Impression?.impression_count).toBe(1);
  });

  it("should track CPM revenue correctly", async () => {
    const pagePath = "/revenue-test";
    const cpmRevenueCents = 50; // $0.50 per impression

    // Record 10 impressions with CPM revenue
    for (let i = 0; i < 10; i++) {
      await recordAdImpression(testSiteId, testPlacementId, pagePath, undefined, cpmRevenueCents);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    const today = new Date().toISOString().split("T")[0];
    const { data: impression } = await sb
      .from("ad_impressions")
      .select("impression_count, cpm_revenue_cents")
      .eq("site_id", testSiteId)
      .eq("ad_placement_id", testPlacementId)
      .eq("page_path", pagePath)
      .eq("impression_date", today)
      .single();

    expect(impression?.impression_count).toBe(10);
    // Total revenue should be 10 * $0.50 = $5.00 = 500 cents
    expect(impression?.cpm_revenue_cents).toBe(500);
  });

  it("should update last_seen_at on each impression", async () => {
    const pagePath = "/last-seen-test";

    // Record first impression
    await recordAdImpression(testSiteId, testPlacementId, pagePath);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const today = new Date().toISOString().split("T")[0];
    const { data: firstImpression } = await sb
      .from("ad_impressions")
      .select("last_seen_at")
      .eq("site_id", testSiteId)
      .eq("ad_placement_id", testPlacementId)
      .eq("page_path", pagePath)
      .eq("impression_date", today)
      .single();

    const firstSeenAt = new Date(firstImpression!.last_seen_at!);

    // Wait a bit and record another impression
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await recordAdImpression(testSiteId, testPlacementId, pagePath);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const { data: secondImpression } = await sb
      .from("ad_impressions")
      .select("last_seen_at")
      .eq("site_id", testSiteId)
      .eq("ad_placement_id", testPlacementId)
      .eq("page_path", pagePath)
      .eq("impression_date", today)
      .single();

    const secondSeenAt = new Date(secondImpression!.last_seen_at!);

    // last_seen_at should be updated
    expect(secondSeenAt.getTime()).toBeGreaterThan(firstSeenAt.getTime());
  });
});
