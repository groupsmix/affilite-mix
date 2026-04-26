/**
 * LIVE-10 / F-024: Stripe webhook idempotency must be atomic.
 *
 * These tests assert that `processStripeEvent` records the Stripe
 * event id and applies the membership-side effect through a single
 * `apply_stripe_membership_event` RPC call, and that the route
 * surfaces duplicate vs. fresh deliveries via the returned
 * `{ duplicate }` flag.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();

vi.mock("@/lib/server-only/service-role", () => ({
  getPrivilegedSupabaseClient: () => ({ rpc: rpcMock }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { processStripeEvent } from "@/lib/stripe-event-processor";

type StripeStub = {
  subscriptions: { retrieve: ReturnType<typeof vi.fn> };
};

function makeStripe(): StripeStub {
  return {
    subscriptions: {
      retrieve: vi.fn(async (id: string) => ({
        id,
        status: "active",
        current_period_start: 1_700_000_000,
        current_period_end: 1_702_000_000,
      })),
    },
  };
}

beforeEach(() => {
  rpcMock.mockReset();
});

describe("processStripeEvent — atomic idempotency (LIVE-10 / F-024)", () => {
  it("checkout.session.completed → calls apply_stripe_membership_event with create_membership", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { duplicate: false, membership_id: "mem_1" },
      error: null,
    });

    const stripe = makeStripe();
    const event = {
      id: "evt_1",
      type: "checkout.session.completed",
      data: {
        object: {
          customer_email: "alice@example.com",
          customer: "cus_123",
          subscription: "sub_123",
          metadata: { site_id: "11111111-1111-1111-1111-111111111111", tier: "pro" },
        },
      },
    } as any;

    const result = await processStripeEvent(stripe as any, event);

    expect(result).toEqual({ duplicate: false, membershipId: "mem_1" });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("apply_stripe_membership_event", {
      p_stripe_event_id: "evt_1",
      p_event_type: "checkout.session.completed",
      p_event_data: expect.objectContaining({
        op: "create_membership",
        site_id: "11111111-1111-1111-1111-111111111111",
        email: "alice@example.com",
        tier: "pro",
        stripe_customer_id: "cus_123",
        stripe_subscription_id: "sub_123",
        current_period_start: expect.any(String),
        current_period_end: expect.any(String),
      }),
    });
  });

  it("returns duplicate=true and skips the side-effect log when the RPC reports a replay", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { duplicate: true, membership_id: null },
      error: null,
    });

    const stripe = makeStripe();
    const event = {
      id: "evt_dup",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_dup", status: "active" } },
    } as any;

    const result = await processStripeEvent(stripe as any, event);

    expect(result).toEqual({ duplicate: true, membershipId: null });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("apply_stripe_membership_event", {
      p_stripe_event_id: "evt_dup",
      p_event_type: "customer.subscription.updated",
      p_event_data: { op: "update_status", stripe_subscription_id: "sub_dup", status: "active" },
    });
  });

  it("propagates RPC errors so the route returns 500 and Stripe retries", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "deadlock detected", code: "40P01" },
    });

    const stripe = makeStripe();
    const event = {
      id: "evt_err",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_err" } },
    } as any;

    await expect(processStripeEvent(stripe as any, event)).rejects.toMatchObject({
      message: "deadlock detected",
    });

    // Crucially, only ONE RPC call was made — the idempotency check
    // and the side effect are merged into a single transaction.
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("invoice.paid → renews via the same RPC", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { duplicate: false, membership_id: "mem_2" },
      error: null,
    });

    const stripe = makeStripe();
    const event = {
      id: "evt_inv",
      type: "invoice.paid",
      data: { object: { subscription: "sub_inv" } },
    } as any;

    const result = await processStripeEvent(stripe as any, event);

    expect(result.duplicate).toBe(false);
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_inv");
    expect(rpcMock).toHaveBeenCalledWith(
      "apply_stripe_membership_event",
      expect.objectContaining({
        p_stripe_event_id: "evt_inv",
        p_event_data: expect.objectContaining({
          op: "renew_membership",
          stripe_subscription_id: "sub_inv",
        }),
      }),
    );
  });

  it("unhandled event types still record the event id with a noop side effect", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { duplicate: false, membership_id: null },
      error: null,
    });

    const stripe = makeStripe();
    const event = {
      id: "evt_noop",
      type: "payout.paid",
      data: { object: {} },
    } as any;

    const result = await processStripeEvent(stripe as any, event);

    expect(result).toEqual({ duplicate: false, membershipId: null });
    expect(rpcMock).toHaveBeenCalledWith("apply_stripe_membership_event", {
      p_stripe_event_id: "evt_noop",
      p_event_type: "payout.paid",
      p_event_data: { op: "noop" },
    });
  });
});
