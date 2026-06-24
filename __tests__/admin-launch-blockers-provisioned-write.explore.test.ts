/**
 * Spec: admin-launch-blockers — Phase 1, Task 2.
 *
 * Property 2 (Bug Condition): Provisioned-site writes succeed with actionable failures.
 * Validates: Requirements 2.2, 2.5  (F-009 isBugCondition rc1 create branch / F-010 rc2 save branch).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS A BUGFIX *EXPLORATION* TEST. It encodes the EXPECTED (post-fix)
 * behavior and is therefore EXPECTED TO FAIL on the current (unfixed) code.
 * The failure is the success criterion for this task: it confirms F-009/F-010 —
 * a New Product write against an UNPROVISIONED site fails, and the failure is
 * surfaced only as a generic "Failed to create product" / "Failed to save" with
 * NO actionable cause (e.g. "This site isn't provisioned in the database yet")
 * and NO error reference id. DO NOT change the code to make it pass during
 * Phase 1; the SAME test is re-run in Phase 4 to confirm the fix.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Scoped PBT approach (design Test Case 3): for varying valid New Product
 * payloads, POST against an unprovisioned site via app/api/admin/products/route.ts
 * with the DB layer injected to fail the write the way an unprovisioned site
 * does (a Postgres foreign-key violation on `products.site_id` → `sites`).
 * Assert the EXPECTED (post-fix, Requirement 2.5) behavior: the JSON error body
 * surfaces the actual, actionable cause AND/OR an error reference id rather than
 * a generic message. On the unfixed code this assertion fails (the body is just
 * `{ error: "Failed to create product" }`).
 *
 * DB failure states are injected via mocks rather than depending on a live
 * unprovisioned database, mirroring the other Phase 1 exploration tests.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import fc from "fast-check";
import { NextResponse } from "next/server";

const SITE_ID = "11111111-1111-1111-1111-111111111111";
const SITE_SLUG = "watch-tools";

const mocks = vi.hoisted(() => ({
  createProduct: vi.fn(),
  checkRateLimit: vi.fn(),
  parseJsonBody: vi.fn(),
  validateCreateProduct: vi.fn(),
  validateAdminUrlFields: vi.fn(),
  recordAuditEvent: vi.fn(),
  captureException: vi.fn(),
  revalidateTag: vi.fn(),
}));

// Bypass auth/permission wrapping: invoke the real handler directly with a
// server-derived session + active site (the unprovisioned `watch-tools`).
vi.mock("@/lib/authz", () => ({
  withAuthz:
    (_feature: string, _action: string, handler: (req: unknown, ctx: unknown) => unknown) =>
    (request: unknown) =>
      handler(request, {
        session: { userId: "admin-1", email: "admin@example.com" },
        siteId: SITE_ID,
        siteSlug: SITE_SLUG,
      }),
  // Unused by POST but imported by the route module.
  authorizeResource: vi.fn(),
  authorizationErrorResponse: vi.fn(),
}));

// ConflictError must remain a real class so `err instanceof ConflictError` works.
class ConflictError extends Error {}
vi.mock("@/lib/dal/products", () => ({
  createProduct: mocks.createProduct,
  listProducts: vi.fn(),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
  ConflictError,
}));

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/api-error", () => ({
  parseJsonBody: mocks.parseJsonBody,
  apiError: vi.fn(),
}));
vi.mock("@/lib/validation", () => ({
  validateCreateProduct: mocks.validateCreateProduct,
  validateUpdateProduct: vi.fn(),
}));
vi.mock("@/lib/admin-url-guard", () => ({ validateAdminUrlFields: mocks.validateAdminUrlFields }));
vi.mock("@/lib/audit-log", () => ({ recordAuditEvent: mocks.recordAuditEvent }));
vi.mock("@/lib/sentry", () => ({ captureException: mocks.captureException }));
vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag }));
vi.mock("@/lib/cache-tags", () => ({ productsTag: (id: string) => `products:${id}` }));

/**
 * The Postgres error an unprovisioned site produces: the `products.site_id` FK
 * to `sites` has no matching row, so the INSERT raises a 23503 foreign-key
 * violation. `createProduct` rethrows the raw PostgREST error object.
 */
function unprovisionedSiteFkError() {
  return {
    code: "23503",
    message:
      'insert or update on table "products" violates foreign key constraint "products_site_id_fkey"',
    details: `Key (site_id)=(${SITE_ID}) is not present in table "sites".`,
    hint: null,
  };
}

/** Generic, non-actionable messages the current code returns on save failure. */
const GENERIC_MESSAGES = new Set([
  "failed to create product",
  "failed to save",
  "failed to save product",
  "failed to update product",
  "internal server error",
]);

function validProductPayload() {
  return fc.record({
    name: fc.string({ minLength: 1, maxLength: 40 }).map((s) => `P ${s}`),
    slug: fc
      .string({ minLength: 1, maxLength: 20 })
      .map((s) => s.replace(/[^a-z0-9-]/gi, "x").toLowerCase() || "slug"),
    description: fc.string({ maxLength: 80 }),
    affiliate_url: fc.constant("https://example.com/go"),
    image_url: fc.constant("https://example.com/img.png"),
    price: fc.constant("$10"),
    price_amount: fc.integer({ min: 1, max: 100000 }),
    price_currency: fc.constant("USD"),
    merchant: fc.string({ maxLength: 20 }),
    score: fc.integer({ min: 0, max: 100 }),
    featured: fc.boolean(),
    status: fc.constantFrom("draft", "active", "archived"),
    category_id: fc.constant(null),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Auth/rate-limit/validation all succeed; only the DB write fails (the
  // unprovisioned-site condition we are exercising).
  mocks.checkRateLimit.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
  mocks.validateAdminUrlFields.mockReturnValue(null);
  mocks.recordAuditEvent.mockResolvedValue(undefined);
  mocks.createProduct.mockRejectedValue(unprovisionedSiteFkError());
});

describe("admin-launch-blockers Property 2 (F-009/F-010): provisioned-site writes succeed with actionable failures", () => {
  it("EXPECTED-FAIL on unfixed code: a failed New Product save surfaces an actionable cause and/or an error reference id (not a generic message)", async () => {
    const { POST } = await import("@/app/api/admin/products/route");

    await fc.assert(
      fc.asyncProperty(validProductPayload(), async (payload) => {
        // Inject the New Product submission body + a passing validation result.
        mocks.parseJsonBody.mockResolvedValue(payload);
        mocks.validateCreateProduct.mockReturnValue({ data: payload });

        const res = (await POST(
          new Request("https://x/api/admin/products", {
            method: "POST",
          }) as never,
        )) as NextResponse;

        const body = (await res.json()) as Record<string, unknown>;

        // The write was blocked (unprovisioned site) — sanity-check the precondition.
        expect(res.status).toBeGreaterThanOrEqual(400);

        const message = typeof body.error === "string" ? body.error.trim().toLowerCase() : "";
        const hasActionableCause = message.length > 0 && !GENERIC_MESSAGES.has(message);

        const referenceId =
          body.errorId ??
          body.error_id ??
          body.referenceId ??
          body.reference ??
          body.ref ??
          body.eventId ??
          body.correlationId;
        const hasReferenceId = typeof referenceId === "string" && referenceId.length > 0;

        // Expected (post-fix) behavior per Property 2 / Requirement 2.5: the
        // failure SHALL surface the actual, actionable cause (e.g. "This site
        // isn't provisioned in the database yet") AND/OR an error reference id
        // rather than a generic "Failed to save."
        expect(hasActionableCause || hasReferenceId).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
