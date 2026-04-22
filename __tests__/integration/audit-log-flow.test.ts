/**
 * Integration test: Audit log write and read operations
 *
 * This test verifies that the audit log correctly stores and retrieves
 * audit events with all required columns.
 *
 * Tests the fix for Issue #3 (audit log schema alignment).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getServiceClient } from "@/lib/supabase-server";

describe("Audit Log Flow Integration", () => {
  const sb = getServiceClient();
  let testSiteId: string;
  let testAdminId: string;

  beforeEach(async () => {
    // Create a test site
    const { data: site, error: siteError } = await sb
      .from("sites")
      .insert({
        slug: `test-audit-${Date.now()}`,
        name: "Test Audit Site",
        domain: `test-audit-${Date.now()}.test`,
        language: "en",
        direction: "ltr",
      })
      .select()
      .single();

    if (siteError) throw siteError;
    testSiteId = site.id;

    // Create a test admin user
    const { data: admin, error: adminError } = await sb
      .from("admin_users")
      .insert({
        email: `test-audit-${Date.now()}@example.com`,
        password_hash: "dummy_hash",
        name: "Test Admin",
        role: "admin",
        is_active: true,
      })
      .select()
      .single();

    if (adminError) throw adminError;
    testAdminId = admin.id;
  });

  afterEach(async () => {
    // Cleanup: delete test data
    await sb.from("sites").delete().eq("id", testSiteId);
    await sb.from("admin_users").delete().eq("id", testAdminId);
  });

  it("should write audit log with all required columns", async () => {
    const testIp = "192.168.1.1";
    const testAction = "product.create";
    const testEntityType = "product";
    const testEntityId = crypto.randomUUID();

    const { data: auditEntry, error } = await sb
      .from("audit_log")
      .insert({
        site_id: testSiteId,
        actor: testAdminId,
        action: testAction,
        entity_type: testEntityType,
        entity_id: testEntityId,
        ip: testIp,
        details: { name: "Test Product", price: 99.99 },
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(auditEntry).toBeDefined();
    expect(auditEntry.site_id).toBe(testSiteId);
    expect(auditEntry.actor).toBe(testAdminId);
    expect(auditEntry.action).toBe(testAction);
    expect(auditEntry.entity_type).toBe(testEntityType);
    expect(auditEntry.entity_id).toBe(testEntityId);
    expect(auditEntry.ip).toBe(testIp);
    expect(auditEntry.details).toEqual({ name: "Test Product", price: 99.99 });
  });

  it("should read audit log entries with filters", async () => {
    // Create multiple audit entries
    const entries = [
      {
        site_id: testSiteId,
        actor: testAdminId,
        action: "product.create",
        entity_type: "product",
        entity_id: crypto.randomUUID(),
        ip: "192.168.1.1",
        details: {},
      },
      {
        site_id: testSiteId,
        actor: testAdminId,
        action: "product.update",
        entity_type: "product",
        entity_id: crypto.randomUUID(),
        ip: "192.168.1.2",
        details: {},
      },
      {
        site_id: testSiteId,
        actor: testAdminId,
        action: "category.create",
        entity_type: "category",
        entity_id: crypto.randomUUID(),
        ip: "192.168.1.1",
        details: {},
      },
    ];

    await sb.from("audit_log").insert(entries);

    // Filter by entity_type
    const { data: productEntries } = await sb
      .from("audit_log")
      .select()
      .eq("site_id", testSiteId)
      .eq("entity_type", "product")
      .order("created_at", { ascending: false });

    expect(productEntries).toHaveLength(2);
    expect(productEntries?.every((e) => e.entity_type === "product")).toBe(true);

    // Filter by action
    const { data: createEntries } = await sb
      .from("audit_log")
      .select()
      .eq("site_id", testSiteId)
      .like("action", "%create")
      .order("created_at", { ascending: false });

    expect(createEntries).toHaveLength(2);
    expect(createEntries?.every((e) => e.action.endsWith("create"))).toBe(true);

    // Filter by actor
    const { data: actorEntries } = await sb
      .from("audit_log")
      .select()
      .eq("site_id", testSiteId)
      .eq("actor", testAdminId)
      .order("created_at", { ascending: false });

    expect(actorEntries).toHaveLength(3);
  });

  it("should handle null actor (system actions)", async () => {
    const { data: auditEntry, error } = await sb
      .from("audit_log")
      .insert({
        site_id: testSiteId,
        actor: null, // System action, no admin user
        action: "cron.publish",
        entity_type: "content",
        entity_id: crypto.randomUUID(),
        ip: null,
        details: { scheduled_count: 5 },
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(auditEntry).toBeDefined();
    expect(auditEntry.actor).toBeNull();
    expect(auditEntry.action).toBe("cron.publish");
  });

  it("should support IP address filtering", async () => {
    const testIp = "203.0.113.42";

    await sb.from("audit_log").insert({
      site_id: testSiteId,
      actor: testAdminId,
      action: "login.success",
      entity_type: "admin_user",
      entity_id: testAdminId,
      ip: testIp,
      details: {},
    });

    // Query by IP
    const { data: ipEntries } = await sb
      .from("audit_log")
      .select()
      .eq("site_id", testSiteId)
      .eq("ip", testIp);

    expect(ipEntries).toHaveLength(1);
    expect(ipEntries?.[0].ip).toBe(testIp);
  });

  it("should enforce site_id isolation", async () => {
    // Create another site
    const { data: otherSite } = await sb
      .from("sites")
      .insert({
        slug: `test-audit-other-${Date.now()}`,
        name: "Other Site",
        domain: `test-audit-other-${Date.now()}.test`,
        language: "en",
        direction: "ltr",
      })
      .select()
      .single();

    const otherSiteId = otherSite!.id;

    // Create audit entries for both sites
    await sb.from("audit_log").insert([
      {
        site_id: testSiteId,
        actor: testAdminId,
        action: "test.action",
        entity_type: "test",
        entity_id: "1",
        ip: "192.168.1.1",
        details: {},
      },
      {
        site_id: otherSiteId,
        actor: testAdminId,
        action: "test.action",
        entity_type: "test",
        entity_id: "2",
        ip: "192.168.1.1",
        details: {},
      },
    ]);

    // Query for testSiteId only
    const { data: siteEntries } = await sb
      .from("audit_log")
      .select()
      .eq("site_id", testSiteId)
      .eq("action", "test.action");

    expect(siteEntries).toHaveLength(1);
    expect(siteEntries?.[0].site_id).toBe(testSiteId);
    expect(siteEntries?.[0].entity_id).toBe("1");

    // Cleanup
    await sb.from("sites").delete().eq("id", otherSiteId);
  });
});
