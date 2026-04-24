/**
 * Integration test: Newsletter subscribe → confirm → unsubscribe flow
 *
 * This test verifies the complete newsletter lifecycle:
 * 1. User subscribes with email
 * 2. Receives confirmation token
 * 3. Confirms subscription via token
 * 4. Receives unsubscribe token
 * 5. Unsubscribes via token
 *
 * Tests the fix for Issue #1 (unsubscribe_token column) and validates
 * the double opt-in flow end-to-end.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getServiceClient } from "@/lib/supabase-server";
import { shouldRunSupabaseIntegration } from "./helpers/should-run";

describe.skipIf(!shouldRunSupabaseIntegration)("Newsletter Flow Integration", () => {
  const sb = getServiceClient();
  let testSiteId: string;
  let testEmail: string;

  beforeEach(async () => {
    // Create a test site
    const { data: site, error: siteError } = await sb
      .from("sites")
      .insert({
        slug: `test-newsletter-${Date.now()}`,
        name: "Test Newsletter Site",
        domain: `test-newsletter-${Date.now()}.test`,
        language: "en",
        direction: "ltr",
      })
      .select()
      .single();

    if (siteError) throw siteError;
    testSiteId = site.id;
    testEmail = `test-${Date.now()}@example.com`;
  });

  afterEach(async () => {
    // Cleanup: delete test site (cascade deletes subscribers)
    await sb.from("sites").delete().eq("id", testSiteId);
  });

  it("should complete full subscribe → confirm → unsubscribe flow", async () => {
    // Step 1: Subscribe
    const { data: subscriber, error: subscribeError } = await sb
      .from("newsletter_subscribers")
      .insert({
        site_id: testSiteId,
        email: testEmail,
        status: "pending",
        confirmation_token: crypto.randomUUID(),
      })
      .select()
      .single();

    expect(subscribeError).toBeNull();
    expect(subscriber).not.toBeNull();
    expect(subscriber!.status).toBe("pending");
    expect(subscriber!.confirmation_token).toBeDefined();
    expect(subscriber!.unsubscribe_token).toBeDefined(); // Issue #1 fix verification

    const confirmationToken = subscriber!.confirmation_token!;
    const unsubscribeToken = subscriber!.unsubscribe_token!;

    // Step 2: Confirm subscription
    const { error: confirmError } = await sb
      .from("newsletter_subscribers")
      .update({
        status: "active",
        confirmed_at: new Date().toISOString(),
        confirmation_token: null,
      })
      .eq("confirmation_token", confirmationToken);

    expect(confirmError).toBeNull();

    // Verify status is now active
    const { data: confirmedSubscriber } = await sb
      .from("newsletter_subscribers")
      .select()
      .eq("site_id", testSiteId)
      .eq("email", testEmail)
      .single();

    expect(confirmedSubscriber?.status).toBe("active");
    expect(confirmedSubscriber?.confirmed_at).toBeDefined();
    expect(confirmedSubscriber?.confirmation_token).toBeNull();

    // Step 3: Unsubscribe via unsubscribe_token
    const { error: unsubscribeError } = await sb
      .from("newsletter_subscribers")
      .update({ status: "unsubscribed" })
      .eq("unsubscribe_token", unsubscribeToken);

    expect(unsubscribeError).toBeNull();

    // Verify status is now unsubscribed
    const { data: unsubscribedSubscriber } = await sb
      .from("newsletter_subscribers")
      .select()
      .eq("site_id", testSiteId)
      .eq("email", testEmail)
      .single();

    expect(unsubscribedSubscriber?.status).toBe("unsubscribed");
  });

  it("should have unique unsubscribe_token for each subscriber", async () => {
    // Create two subscribers
    const { data: sub1 } = await sb
      .from("newsletter_subscribers")
      .insert({
        site_id: testSiteId,
        email: `test1-${Date.now()}@example.com`,
        status: "active",
      })
      .select()
      .single();

    const { data: sub2 } = await sb
      .from("newsletter_subscribers")
      .insert({
        site_id: testSiteId,
        email: `test2-${Date.now()}@example.com`,
        status: "active",
      })
      .select()
      .single();

    expect(sub1?.unsubscribe_token).toBeDefined();
    expect(sub2?.unsubscribe_token).toBeDefined();
    expect(sub1?.unsubscribe_token).not.toBe(sub2?.unsubscribe_token);
  });

  it("should prevent unsubscribe with invalid token", async () => {
    // Create a subscriber
    await sb.from("newsletter_subscribers").insert({
      site_id: testSiteId,
      email: testEmail,
      status: "active",
    });

    // Try to unsubscribe with fake token
    const fakeToken = crypto.randomUUID();
    const { data, error } = await sb
      .from("newsletter_subscribers")
      .update({ status: "unsubscribed" })
      .eq("unsubscribe_token", fakeToken)
      .select();

    // Should not update any rows
    expect(data).toEqual([]);
  });
});
