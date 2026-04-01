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

    await recordAuditEvent(event);

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

    await recordAuditEvent(event);

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

  it("retries once on insert failure and logs errors", async () => {
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
    await expect(recordAuditEvent(event)).resolves.toBeUndefined();

    // Should have been called twice (initial + retry)
    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(consoleSpy).toHaveBeenCalledWith(
      "[audit-log] Insert failed, retrying once:",
      "DB connection failed",
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      "[audit-log] Retry also failed:",
      "DB connection failed",
    );

    consoleSpy.mockRestore();
  });

  it("succeeds on retry if first insert fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockInsert
      .mockReturnValueOnce(Promise.resolve({ error: { message: "Transient error" } }))
      .mockReturnValueOnce(Promise.resolve({ error: null }));

    const event: AuditEvent = {
      site_id: "site-123",
      actor: "admin@example.com",
      action: "update",
      entity_type: "content",
      entity_id: "c-1",
    };

    await recordAuditEvent(event);

    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(consoleSpy).toHaveBeenCalledWith(
      "[audit-log] Insert failed, retrying once:",
      "Transient error",
    );
    // Should NOT have the retry-failed message
    expect(consoleSpy).not.toHaveBeenCalledWith(
      "[audit-log] Retry also failed:",
      expect.any(String),
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

    await expect(recordAuditEvent(event)).resolves.toBeUndefined();
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });
});
