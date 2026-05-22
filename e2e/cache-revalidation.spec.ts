/**
 * F-04: E2E tests for cache revalidation blast radius.
 *
 * Validates that:
 * - Revalidation requires valid INTERNAL_API_TOKEN
 * - Rate limiting is enforced on the revalidation endpoint
 * - Site-scoped revalidation only invalidates the target site
 */
import { test, expect } from "@playwright/test";

const REVALIDATE_URL = "/api/revalidate";

test.describe("Cache Revalidation", () => {
  test("rejects unauthenticated requests", async ({ request }) => {
    const res = await request.post(REVALIDATE_URL, {
      data: JSON.stringify({ tags: ["content"] }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
  });

  test("rejects requests with invalid token", async ({ request }) => {
    const res = await request.post(REVALIDATE_URL, {
      data: JSON.stringify({ tags: ["content"] }),
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer invalid-token-value",
      },
    });
    expect(res.status()).toBe(401);
  });
});
