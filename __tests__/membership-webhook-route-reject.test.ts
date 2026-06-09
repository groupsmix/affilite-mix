/**
 * F-010: route-level fail-closed behaviour for the Stripe webhook.
 *
 * `lib/stripe-webhook.ts` (constructStripeEvent) is unit-tested for signature
 * verification, but nothing drove the POST handler's wiring. The audit's
 * concern is that a forged/unsigned event must be rejected BEFORE any business
 * logic runs, and that the only 503 path is a missing secret (config), not a
 * verification failure. This pins exactly that:
 *   - no signature        → 400, processStripeEvent NOT called;
 *   - invalid signature   → 400 (not 503, not 200), processStripeEvent NOT called;
 *   - missing secret/key  → 503 (config gate), before any processing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

// Spy on the business-logic processor: it must never run for an unverified
// event. vi.hoisted keeps the spy initialised before the hoisted vi.mock runs.
const { mockProcessStripeEvent } = vi.hoisted(() => ({ mockProcessStripeEvent: vi.fn() }));
vi.mock("@/lib/stripe-event-processor", () => ({
  processStripeEvent: mockProcessStripeEvent,
}));

// Keep the REAL constructStripeEvent (so signature rejection is genuine) but
// stub the key prewarm — no KV/crypto warmup needed for the rejection paths.
vi.mock("@/lib/stripe-webhook", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("@/lib/stripe-webhook");
  return { ...actual, prewarmStripeWebhookKey: vi.fn().mockResolvedValue(undefined) };
});

import { POST } from "@/app/api/membership/webhook/route";

const WEBHOOK_SECRET = "whsec_test_secret";

const BODY = JSON.stringify({
  id: "evt_forged",
  type: "checkout.session.completed",
  data: { object: { id: "cs_forged" } },
});

function webhookRequest(body: string, signature?: string): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature !== undefined) headers["stripe-signature"] = signature;
  return new NextRequest("https://example.com/api/membership/webhook", {
    method: "POST",
    headers,
    body,
  });
}

describe("POST /api/membership/webhook — fail-closed (F-010)", () => {
  beforeEach(() => {
    mockProcessStripeEvent.mockReset();
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rejects a request with no signature header (400) without processing", async () => {
    const res = await POST(webhookRequest(BODY));
    expect(res.status).toBe(400);
    expect(mockProcessStripeEvent).not.toHaveBeenCalled();
  });

  it("rejects a forged/invalid signature (400, not 503, not 200) without processing", async () => {
    const res = await POST(webhookRequest(BODY, "t=1,v1=deadbeef"));
    expect(res.status).toBe(400);
    expect(res.status).not.toBe(503);
    expect(res.status).not.toBe(200);
    expect(mockProcessStripeEvent).not.toHaveBeenCalled();
  });

  it("returns 503 (config gate) only when the secret is unset — before any processing", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    const res = await POST(webhookRequest(BODY, "t=1,v1=deadbeef"));
    expect(res.status).toBe(503);
    expect(mockProcessStripeEvent).not.toHaveBeenCalled();
  });
});
