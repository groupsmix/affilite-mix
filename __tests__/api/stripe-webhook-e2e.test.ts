/**
 * A86-2: E2E test for Stripe checkout.session.completed webhook.
 *
 * Triggers the real POST handler with a properly-signed mock event
 * and verifies subscription activation through processStripeEvent.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn().mockReturnThis() },
}));

const processStripeEventMock = vi.fn();
vi.mock("@/lib/stripe-event-processor", () => ({
  processStripeEvent: (...args: unknown[]) => processStripeEventMock(...args),
}));
vi.mock("@/lib/stripe-client", () => ({
  getStripeClient: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/runtime-env", () => ({ getAppCacheKV: vi.fn().mockReturnValue(null) }));
vi.mock("@/lib/dal/webhook-dlq", () => ({ writeToDlq: vi.fn().mockResolvedValue(undefined) }));

const WEBHOOK_SECRET = "whsec_test_secret";

async function signPayload(payload: string, ts: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}.${payload}`));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `t=${ts},v1=${hex}`;
}

function checkoutEvent() {
  return JSON.stringify({
    id: "evt_test_checkout_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_session",
        customer_email: "buyer@example.com",
        customer: "cus_test_123",
        subscription: "sub_test_123",
        metadata: { site_id: "11111111-1111-1111-1111-111111111111", tier: "pro" },
      },
    },
  });
}

describe("Stripe webhook POST (A86-2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
  });

  it("accepts checkout.session.completed and activates subscription", async () => {
    processStripeEventMock.mockResolvedValue({ duplicate: false, membershipId: "mem_1" });
    const payload = checkoutEvent();
    const sig = await signPayload(payload, Math.floor(Date.now() / 1000));

    const { POST } = await import("@/app/api/membership/webhook/route");
    const res = await POST(
      new NextRequest("http://localhost/api/membership/webhook", {
        method: "POST",
        headers: { "stripe-signature": sig },
        body: payload,
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).received).toBe(true);
    expect(processStripeEventMock).toHaveBeenCalledOnce();
    expect(processStripeEventMock.mock.calls[0][1].type).toBe("checkout.session.completed");
  });

  it("returns duplicate flag when event replayed", async () => {
    processStripeEventMock.mockResolvedValue({ duplicate: true, membershipId: null });
    const payload = checkoutEvent();
    const sig = await signPayload(payload, Math.floor(Date.now() / 1000));

    const { POST } = await import("@/app/api/membership/webhook/route");
    const res = await POST(
      new NextRequest("http://localhost/api/membership/webhook", {
        method: "POST",
        headers: { "stripe-signature": sig },
        body: payload,
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).duplicate).toBe(true);
  });

  it("returns 400 when signature is missing", async () => {
    const { POST } = await import("@/app/api/membership/webhook/route");
    const res = await POST(
      new NextRequest("http://localhost/api/membership/webhook", {
        method: "POST",
        body: checkoutEvent(),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when signature is invalid", async () => {
    const { POST } = await import("@/app/api/membership/webhook/route");
    const ts = Math.floor(Date.now() / 1000);
    const res = await POST(
      new NextRequest("http://localhost/api/membership/webhook", {
        method: "POST",
        headers: { "stripe-signature": `t=${ts},v1=deadbeef00112233` },
        body: checkoutEvent(),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 503 when webhook secret not configured", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const { POST } = await import("@/app/api/membership/webhook/route");
    const res = await POST(
      new NextRequest("http://localhost/api/membership/webhook", {
        method: "POST",
        body: checkoutEvent(),
      }),
    );
    expect(res.status).toBe(503);
  });
});
