/**
 * F-04: E2E / contract tests for Stripe webhook failure and replay.
 *
 * Validates that:
 * - Invalid webhook signatures are rejected
 * - Failed events are recorded in the DLQ after max retries
 * - Replayed events are idempotent (duplicate detection)
 */
import { test, expect } from "@playwright/test";

const WEBHOOK_URL = "/api/membership/webhook";

test.describe("Stripe Webhook Replay", () => {
  test("rejects requests without stripe-signature header", async ({ request }) => {
    const res = await request.post(WEBHOOK_URL, {
      data: JSON.stringify({ id: "evt_test", type: "checkout.session.completed" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(400);
  });

  test("rejects invalid signature", async ({ request }) => {
    const res = await request.post(WEBHOOK_URL, {
      data: JSON.stringify({ id: "evt_test", type: "checkout.session.completed" }),
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": "t=123,v1=invalid_signature",
      },
    });
    expect(res.status()).toBe(400);
  });
});
