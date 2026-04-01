import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the supabase-server module before importing audit-log
const mockInsert = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  getServiceClient: () => ({
    from: () => ({
      insert: mockInsert,
    }),
  }),
}));

import { recordAuditEvent, type AuditEvent } from "@/lib/audit-log";

describe("recordAuditEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts the event with all required fields", async () => {
    mockInsert.mockReturnValue(Promise.resolve({ error: null }));

    const event: AuditEvent = {
      site_id: "site-123",
      actor: "admin@example.com",
      action: "create",
      entity_type: "content",
      entity_id: "content-456",
    };

    recordAuditEvent(event);

    // Give the fire-and-forget promise time to resolve
    await new Promise((r) => setTimeout(r, 10));

    expect(mockInsert).toHaveBeenCalledWith({
      site_id: "site-123",
      actor: "admin@example.com",
      action: "create",
      entity_type: "content",
      entity_id: "content-456",
      details: {},
      ip: "",
    });
  });

  it("passes optional details and ip when provided", async () => {
    mockInsert.mockReturnValue(Promise.resolve({ error: null }));

    const event: AuditEvent = {
      site_id: "site-123",
      actor: "admin@example.com",
      action: "update",
      entity_type: "product",
      entity_id: "product-789",
      details: { field: "name", oldValue: "Old", newValue: "New" },
      ip: "192.168.1.1",
    };

    recordAuditEvent(event);
    await new Promise((r) => setTimeout(r, 10));

    expect(mockInsert).toHaveBeenCalledWith({
      site_id: "site-123",
      actor: "admin@example.com",
      action: "update",
      entity_type: "product",
      entity_id: "product-789",
      details: { field: "name", oldValue: "Old", newValue: "New" },
      ip: "192.168.1.1",
    });
  });

  it("logs error to console but does not throw on insert failure", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockInsert.mockReturnValue(Promise.resolve({ error: { message: "DB connection failed" } }));

    const event: AuditEvent = {
      site_id: "site-123",
      actor: "admin@example.com",
      action: "delete",
      entity_type: "category",
      entity_id: "cat-111",
    };

    // Should not throw
    expect(() => recordAuditEvent(event)).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));

    expect(consoleSpy).toHaveBeenCalledWith(
      "[audit-log] Failed to record event:",
      "DB connection failed",
    );

    consoleSpy.mockRestore();
  });

  it("does not throw when insert succeeds", async () => {
    mockInsert.mockReturnValue(Promise.resolve({ error: null }));

    const event: AuditEvent = {
      site_id: "site-1",
      actor: "user@test.com",
      action: "create",
      entity_type: "content",
      entity_id: "c-1",
    };

    expect(() => recordAuditEvent(event)).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
  });
});
