/**
 * A1 — Stripe event logic fixes (Bugs 3 + 4).
 *
 * Bug 3 — `missed_update` must not be dead code. When the RPC reports that an
 *         out-of-order renew/update/cancel matched 0 rows, the processor must
 *         capture the event durably (DLQ) instead of silently returning a clean
 *         200. (Throw-to-retry is futile here: the RPC has already committed the
 *         idempotency row, so a Stripe retry short-circuits as a duplicate.)
 *
 * Bug 4 — the billing period must be read from
 *         `subscription.items.data[].current_period_*` (Stripe API
 *         2026-05-27.dahlia), not the Subscription root, so periods stop
 *         persisting as NULL.
 *
 * Mirrors the mock conventions in stripe-event-processor.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();
const writeToDlqMock = vi.fn();

/** Wraps the rpcMock return value so `.unsafeNoSiteFilter()` chains. */
function chainableRpc(...args: unknown[]) {
  const result = rpcMock(...args);
  if (result && typeof result.then === "function") {
    return Object.assign(result, { unsafeNoSiteFilter: () => result });
  }
  return Object.assign(Promise.resolve(result), {
    unsafeNoSiteFilter: () => Promise.resolve(result),
    then: (r: unknown, j: unknown) => Promise.resolve(result).then(r as never, j as never),
  });
}

vi.mock("@/lib/server-only/service-role", () => ({
  getPrivilegedSupabaseClient: () => ({ rpc: chainableRpc }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/dal/webhook-dlq", () => ({
  writeToDlq: (entry: unknown) => writeToDlqMock(entry),
}));

// Audit trail is best-effort and swallowed in the processor; mock it to a no-op
// so the tests stay hermetic and never reach a real Supabase client.
vi.mock("@/lib/audit-log", () => ({
  recordAuditEvent: vi.fn(async () => {}),
}));

import { processStripeEvent } from "@/lib/stripe-event-processor";

type StripeStub = {
  subscriptions: { retrieve: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  rpcMock.mockReset();
  writeToDlqMock.mockReset();
});

describe("Bug 3 — missed_update is surfaced to the DLQ, not silently ACKed", () => {
  it("routes an out-of-order update_status (0 rows matched) to the durable DLQ", async () => {
    // RPC already committed the event id, then reported missed_update.
    rpcMock.mockResolvedValueOnce({
      data: { duplicate: false, membership_id: null, missed_update: true, op: "update_status" },
      error: null,
    });

    const stripe: StripeStub = { subscriptions: { retrieve: vi.fn() } };
    const event = {
      id: "evt_missed",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_orphan", status: "past_due" } },
    } as never;

    const result = await processStripeEvent(stripe as never, event);

    // The lost mutation is captured durably for reconciliation...
    expect(writeToDlqMock).toHaveBeenCalledTimes(1);
    expect(writeToDlqMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event_id: "evt_missed",
        event_type: "customer.subscription.updated",
        attempts: 1,
        payload: expect.objectContaining({
          op: "update_status",
          stripe_subscription_id: "sub_orphan",
          status: "past_due",
        }),
      }),
    );
    // ...and the processor does NOT report a successful membership mutation that
    // would mask the loss (membershipId stays null).
    expect(result).toEqual({ duplicate: false, membershipId: null });
  });

  it("routes an out-of-order renew_membership to the DLQ as well", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { duplicate: false, membership_id: null, missed_update: true, op: "renew_membership" },
      error: null,
    });

    const stripe: StripeStub = {
      subscriptions: {
        retrieve: vi.fn(async (id: string) => ({
          id,
          status: "active",
          items: {
            data: [{ current_period_start: 1_750_000_000, current_period_end: 1_752_000_000 }],
          },
        })),
      },
    };
    const event = {
      id: "evt_missed_renew",
      type: "invoice.paid",
      data: { object: { subscription: "sub_orphan_renew" } },
    } as never;

    const result = await processStripeEvent(stripe as never, event);

    expect(writeToDlqMock).toHaveBeenCalledTimes(1);
    expect(writeToDlqMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event_id: "evt_missed_renew",
        payload: expect.objectContaining({
          op: "renew_membership",
          stripe_subscription_id: "sub_orphan_renew",
        }),
      }),
    );
    expect(result).toEqual({ duplicate: false, membershipId: null });
  });

  it("propagates a DLQ write failure (fail-loud) so the webhook route returns 5xx", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { duplicate: false, membership_id: null, missed_update: true, op: "cancel_membership" },
      error: null,
    });
    writeToDlqMock.mockRejectedValueOnce(new Error("DLQ table unavailable"));

    const stripe: StripeStub = { subscriptions: { retrieve: vi.fn() } };
    const event = {
      id: "evt_missed_cancel",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_orphan2" } },
    } as never;

    await expect(processStripeEvent(stripe as never, event)).rejects.toThrow(
      /DLQ table unavailable/,
    );
    expect(writeToDlqMock).toHaveBeenCalledTimes(1);
  });

  it("a normal (non-missed) result never touches the DLQ", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { duplicate: false, membership_id: "mem_ok" },
      error: null,
    });

    const stripe: StripeStub = { subscriptions: { retrieve: vi.fn() } };
    const event = {
      id: "evt_ok",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_ok" } },
    } as never;

    const result = await processStripeEvent(stripe as never, event);

    expect(result).toEqual({ duplicate: false, membershipId: "mem_ok" });
    expect(writeToDlqMock).not.toHaveBeenCalled();
  });
});

describe("Bug 4 — billing period read from items[].current_period_* (dahlia)", () => {
  it("create path: populates period from subscription.items.data[0] when the root fields are absent", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { duplicate: false, membership_id: "mem_dahlia" },
      error: null,
    });

    const periodStart = 1_750_000_000;
    const periodEnd = 1_752_000_000;
    const stripe: StripeStub = {
      subscriptions: {
        retrieve: vi.fn(async (id: string) => ({
          id,
          status: "active",
          // dahlia shape: period lives on the item, NOT the subscription root.
          items: {
            data: [
              {
                price: { id: "price_x" },
                current_period_start: periodStart,
                current_period_end: periodEnd,
              },
            ],
          },
        })),
      },
    };
    const event = {
      id: "evt_create_dahlia",
      type: "checkout.session.completed",
      data: {
        object: {
          customer_email: "alice@example.com",
          customer: "cus_x",
          subscription: "sub_x",
          metadata: { site_id: "11111111-1111-1111-1111-111111111111", tier: "pro" },
        },
      },
    } as never;

    await processStripeEvent(stripe as never, event);

    expect(rpcMock).toHaveBeenCalledWith(
      "apply_stripe_membership_event",
      expect.objectContaining({
        p_event_data: expect.objectContaining({
          op: "create_membership",
          current_period_start: new Date(periodStart * 1000).toISOString(),
          current_period_end: new Date(periodEnd * 1000).toISOString(),
        }),
      }),
    );
  });

  it("renew path: invoice.paid also reads the item-level period", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { duplicate: false, membership_id: "mem_renew" },
      error: null,
    });

    const periodStart = 1_760_000_000;
    const periodEnd = 1_762_000_000;
    const stripe: StripeStub = {
      subscriptions: {
        retrieve: vi.fn(async (id: string) => ({
          id,
          status: "active",
          items: { data: [{ current_period_start: periodStart, current_period_end: periodEnd }] },
        })),
      },
    };
    const event = {
      id: "evt_renew_dahlia",
      type: "invoice.paid",
      data: { object: { subscription: "sub_renew" } },
    } as never;

    await processStripeEvent(stripe as never, event);

    expect(rpcMock).toHaveBeenCalledWith(
      "apply_stripe_membership_event",
      expect.objectContaining({
        p_event_data: expect.objectContaining({
          op: "renew_membership",
          stripe_subscription_id: "sub_renew",
          current_period_start: new Date(periodStart * 1000).toISOString(),
          current_period_end: new Date(periodEnd * 1000).toISOString(),
        }),
      }),
    );
  });

  it("falls back to the legacy root period when items[] carries no period (older API)", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { duplicate: false, membership_id: "mem_legacy" },
      error: null,
    });

    const periodStart = 1_700_000_000;
    const periodEnd = 1_702_000_000;
    const stripe: StripeStub = {
      subscriptions: {
        retrieve: vi.fn(async (id: string) => ({
          id,
          status: "active",
          current_period_start: periodStart,
          current_period_end: periodEnd,
          items: { data: [{ price: { id: "price_legacy" } }] },
        })),
      },
    };
    const event = {
      id: "evt_legacy",
      type: "invoice.paid",
      data: { object: { subscription: "sub_legacy" } },
    } as never;

    await processStripeEvent(stripe as never, event);

    expect(rpcMock).toHaveBeenCalledWith(
      "apply_stripe_membership_event",
      expect.objectContaining({
        p_event_data: expect.objectContaining({
          op: "renew_membership",
          current_period_start: new Date(periodStart * 1000).toISOString(),
          current_period_end: new Date(periodEnd * 1000).toISOString(),
        }),
      }),
    );
  });
});
