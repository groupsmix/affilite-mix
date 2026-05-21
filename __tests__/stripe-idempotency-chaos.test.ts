import { describe, it, expect, vi, beforeEach } from "vitest";
import { applyStripeEventAtomic } from "@/lib/stripe/stripe-event-processor";
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role";

// Mock Supabase
vi.mock("@/lib/server-only/service-role", () => ({
  getPrivilegedSupabaseClient: vi.fn(),
}));

describe("Stripe Webhook Idempotency Chaos (A86)", () => {
  const MOCK_SITE_ID = "00000000-0000-0000-0000-000000000000";
  const MOCK_EVENT_ID = "evt_chaos_123";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fail-closed safely and prevent double-processing when the database abruptly disconnects during idempotency check", async () => {
    // Simulate a database failure exactly during the RPC call
    const mockRpc = vi.fn().mockRejectedValueOnce(new Error("FATAL: terminating connection due to administrator command"));

    (getPrivilegedSupabaseClient as any).mockReturnValue({
      rpc: mockRpc,
    });

    // The atomic processor should catch the DB error, bubble it up, and fail the webhook processing
    // so Stripe will retry. It should NEVER assume "already processed" if the DB crashes.
    await expect(
      applyStripeEventAtomic(MOCK_EVENT_ID, MOCK_SITE_ID, "user_123", "pro", "sub_123", null),
    ).rejects.toThrow("FATAL: terminating connection due to administrator command");

    // Ensure it actually attempted the RPC
    expect(mockRpc).toHaveBeenCalledWith("apply_stripe_membership_event", expect.any(Object));
  });

  it("should fail-closed safely if the connection drops immediately after the RPC but before commit", async () => {
    // Wait, the RPC is atomic. If the network drops while waiting for the response,
    // the driver throws a network error.
    const mockRpc = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed"));

    (getPrivilegedSupabaseClient as any).mockReturnValue({
      rpc: mockRpc,
    });

    await expect(
      applyStripeEventAtomic(MOCK_EVENT_ID, MOCK_SITE_ID, "user_123", "pro", "sub_123", null),
    ).rejects.toThrow("fetch failed");
  });
});
