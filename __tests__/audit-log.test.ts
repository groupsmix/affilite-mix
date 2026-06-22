import { describe, it, expect, vi, beforeEach } from "vitest";

// recordAuditEvent persists via the privileged gateway and opts out of the
// site filter (audit_log is a cross-tenant ledger), so mock that module and
// model the `from(t).insert(row).unsafeNoSiteFilter()` chain: `mockInsert`
// receives the row and returns the awaitable `{ error }`, exactly as the real
// builder does once the opt-out is applied.
const mockInsert = vi.fn();
vi.mock("@/lib/server-only/service-role", () => ({
  getPrivilegedSupabaseClient: () => ({
    from: () => ({
      insert: (row: unknown) => {
        const result = mockInsert(row);
        return { unsafeNoSiteFilter: () => result };
      },
    }),
  }),
}));

import { recordAuditEvent, type AuditEvent } from "@/lib/audit-log";

// A real UUID so the writer's non-uuid → NULL site_id coercion leaves it intact.
const SITE_ID = "11111111-1111-4111-8111-111111111111";

describe("recordAuditEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts the event with all required fields", async () => {
    mockInsert.mockReturnValue(Promise.resolve({ error: null }));

    const event: AuditEvent = {
      site_id: SITE_ID,
      actor: "admin@example.com",
      action: "create",
      entity_type: "content",
      entity_id: "content-456",
    };

    await recordAuditEvent(event);

    expect(mockInsert).toHaveBeenCalledWith({
      site_id: SITE_ID,
      actor: "admin@example.com",
      actor_user_id: null,
      action: "create",
      entity_type: "content",
      entity_id: "content-456",
      details: {},
      ip: null,
      failure_type: null,
    });
  });

  it("passes optional details and ip when provided", async () => {
    mockInsert.mockReturnValue(Promise.resolve({ error: null }));

    const event: AuditEvent = {
      site_id: SITE_ID,
      actor: "admin@example.com",
      action: "update",
      entity_type: "product",
      entity_id: "product-789",
      details: { field: "name", oldValue: "Old", newValue: "New" },
      ip: "192.168.1.1",
    };

    await recordAuditEvent(event);

    expect(mockInsert).toHaveBeenCalledWith({
      site_id: SITE_ID,
      actor: "admin@example.com",
      actor_user_id: null,
      action: "update",
      entity_type: "product",
      entity_id: "product-789",
      details: { field: "name", oldValue: "Old", newValue: "New" },
      ip: "192.168.1.1",
      failure_type: null,
    });
  });

  it("redacts change values for fields outside the entity safe-field allowlist", async () => {
    mockInsert.mockReturnValue(Promise.resolve({ error: null }));

    const event: AuditEvent = {
      site_id: SITE_ID,
      actor: "admin@example.com",
      action: "update",
      entity_type: "product",
      entity_id: "product-789",
      details: { field: "secret_note", oldValue: "private old", newValue: "private new" },
    };

    await recordAuditEvent(event);

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        details: { field: "secret_note" },
      }),
    );
  });

  it("retries once on insert failure and logs errors", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockInsert.mockReturnValue(Promise.resolve({ error: { message: "DB connection failed" } }));

    const event: AuditEvent = {
      site_id: SITE_ID,
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
      expect.stringContaining("[audit-log] Insert failed, retrying once"),
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[audit-log] Retry also failed"),
    );

    consoleSpy.mockRestore();
  });

  it("succeeds on retry if first insert fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockInsert
      .mockReturnValueOnce(Promise.resolve({ error: { message: "Transient error" } }))
      .mockReturnValueOnce(Promise.resolve({ error: null }));

    const event: AuditEvent = {
      site_id: SITE_ID,
      actor: "admin@example.com",
      action: "update",
      entity_type: "content",
      entity_id: "c-1",
    };

    await recordAuditEvent(event);

    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[audit-log] Insert failed, retrying once"),
    );
    // Should NOT have the retry-failed message
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("[audit-log] Retry also failed"),
    );

    consoleSpy.mockRestore();
  });

  it("does not throw when insert succeeds", async () => {
    mockInsert.mockReturnValue(Promise.resolve({ error: null }));

    const event: AuditEvent = {
      site_id: SITE_ID,
      actor: "user@test.com",
      action: "create",
      entity_type: "content",
      entity_id: "c-1",
    };

    await expect(recordAuditEvent(event)).resolves.toBeUndefined();
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("coerces a non-uuid site_id sentinel to NULL", async () => {
    // Auth/cross-site events use the "_global" sentinel. The audit_log.site_id
    // column is a nullable uuid, so a non-uuid value would throw
    // "invalid input syntax for type uuid" and silently drop the row. The
    // writer stores NULL for any non-uuid site_id instead.
    mockInsert.mockReturnValue(Promise.resolve({ error: null }));

    const event: AuditEvent = {
      site_id: "_global",
      actor: "system",
      action: "auth.login.failed",
      entity_type: "admin_user",
      entity_id: "unknown",
    };

    await recordAuditEvent(event);

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ site_id: null }));
  });

  it("preserves a valid uuid site_id unchanged", async () => {
    mockInsert.mockReturnValue(Promise.resolve({ error: null }));

    await recordAuditEvent({
      site_id: SITE_ID,
      actor: "admin@example.com",
      action: "update",
      entity_type: "content",
      entity_id: "c-2",
    });

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ site_id: SITE_ID }));
  });
});
