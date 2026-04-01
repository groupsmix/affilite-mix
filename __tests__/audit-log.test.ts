import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Supabase service client before importing the module
const mockInsert = vi.fn();
const mockFrom = vi.fn(() => ({ insert: mockInsert }));
vi.mock("@/lib/supabase-server", () => ({
  getServiceClient: () => ({ from: mockFrom }),
}));

import { recordAuditEvent, type AuditEvent } from "@/lib/audit-log";

describe("recordAuditEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: insert resolves with no error
    mockInsert.mockReturnValue(Promise.resolve({ error: null }));
  });

  it("inserts an audit event into the audit_log table", () => {
    const event: AuditEvent = {
      site_id: "site-1",
      actor: "admin@example.com",
      action: "create",
      entity_type: "content",
      entity_id: "content-123",
      details: { title: "Test" },
      ip: "127.0.0.1",
    };

    recordAuditEvent(event);

    expect(mockFrom).toHaveBeenCalledWith("audit_log");
    expect(mockInsert).toHaveBeenCalledWith({
      site_id: "site-1",
      actor: "admin@example.com",
      action: "create",
      entity_type: "content",
      entity_id: "content-123",
      details: { title: "Test" },
      ip: "127.0.0.1",
    });
  });

  it("defaults details to {} and ip to empty string when omitted", () => {
    const event: AuditEvent = {
      site_id: "site-1",
      actor: "admin@example.com",
      action: "delete",
      entity_type: "product",
      entity_id: "prod-456",
    };

    recordAuditEvent(event);

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        details: {},
        ip: "",
      }),
    );
  });

  it("logs error to console when insert fails (fire-and-forget)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockInsert.mockReturnValue(Promise.resolve({ error: { message: "DB connection failed" } }));

    const event: AuditEvent = {
      site_id: "site-1",
      actor: "admin@example.com",
      action: "update",
      entity_type: "content",
      entity_id: "content-789",
    };

    recordAuditEvent(event);

    // Wait for the promise to resolve
    await new Promise((r) => setTimeout(r, 10));

    expect(consoleSpy).toHaveBeenCalledWith(
      "[audit-log] Failed to record event:",
      "DB connection failed",
    );

    consoleSpy.mockRestore();
  });
});
