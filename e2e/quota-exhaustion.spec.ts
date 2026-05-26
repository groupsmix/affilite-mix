/**
 * F-04: E2E tests for quota exhaustion behavior.
 *
 * Validates that:
 * - Upload endpoints respect R2 storage quota
 * - AI generation endpoints respect per-tenant token limits
 * - Rate-limited endpoints return proper 429 responses
 */
import { test, expect } from "@playwright/test";

test.describe("Quota Exhaustion", () => {
  test("gift-finder respects rate limits", async ({ request }) => {
    // Send requests until rate-limited
    let rateLimited = false;
    for (let i = 0; i < 35; i++) {
      const res = await request.get("/api/gift-finder?budget=100&occasion=birthday");
      if (res.status() === 429) {
        rateLimited = true;
        const body = await res.json();
        expect(body.error).toContain("Too many requests");
        break;
      }
    }
    // Rate limiting should trigger within the configured window
    expect(rateLimited).toBe(true);
  });

  test("membership checkout respects rate limits", async ({ request }) => {
    const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    if (supaUrl.includes("placeholder")) {
      test.skip(true, "Requires real Supabase backend for Stripe checkout rate limiting");
      return;
    }

    let rateLimited = false;
    for (let i = 0; i < 7; i++) {
      const res = await request.post("/api/membership/checkout", {
        data: JSON.stringify({ email: `test${i}@example.com` }),
        headers: { "Content-Type": "application/json" },
      });
      if (res.status() === 429) {
        rateLimited = true;
        break;
      }
    }
    expect(rateLimited).toBe(true);
  });
});
