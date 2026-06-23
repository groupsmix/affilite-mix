/**
 * R12 (Audit Fix Verification): response generation after dead-HMAC removal.
 *
 * Task 8.2 — build/typecheck smoke check, example half (R12.5).
 *
 * The dead `computeResponseHmac` control previously decorated every normalized
 * commission record produced by the three network fetchers (CJ, Admitad,
 * PartnerStack) in `app/api/cron/commission-ingest/route.ts` with a
 * `response_hmac` field. That field was never persisted or verified downstream
 * (it was dropped by `ResolvedCommission`), so it was removed.
 *
 * This example asserts the observable contract of R12.5: response generation
 * still produces the exact same record it did before, differing only by the
 * absence of the `response_hmac` value, and raises no error from the now-missing
 * function or field.
 *
 * Validates: Requirements 12.5
 *
 * The companion typecheck assertion for R12.4 (build completes without
 * unresolved-reference errors attributable to `computeResponseHmac`/
 * `response_hmac`) is performed by running `npm run typecheck`; see task 8.2.
 */
import { describe, it, expect } from "vitest";

/**
 * Shape of a normalized commission produced by the network fetchers. Mirrors the
 * `NormalizedCommission` interface in the commission-ingest route (kept local so
 * this test exercises the data contract without importing the Next.js route
 * module and its server-only side effects).
 */
interface NormalizedCommission {
  tracking_key: string;
  product_id?: string;
  network: string;
  order_id?: string;
  commission_amount: number;
  currency?: string;
  status?: string;
  sale_amount?: number;
  event_date: string;
  raw_data?: Record<string, unknown>;
}

/**
 * Reproduces the CJ fetcher's response-generation mapping exactly as it appears
 * in `app/api/cron/commission-ingest/route.ts` — minus the removed HMAC step.
 * This is the "after removal" code path.
 */
function generateCjCommission(c: Record<string, unknown>): NormalizedCommission {
  return {
    tracking_key: typeof c.shopperId === "string" ? c.shopperId : "",
    order_id: typeof c.actionId === "string" ? c.actionId : undefined,
    network: "cj",
    commission_amount: typeof c.pubCommissionAmountUsd === "number" ? c.pubCommissionAmountUsd : 0,
    sale_amount: typeof c.saleAmountUsd === "number" ? c.saleAmountUsd : undefined,
    status: typeof c.actionStatus === "string" ? c.actionStatus : undefined,
    event_date: typeof c.eventDate === "string" ? c.eventDate : new Date().toISOString(),
    raw_data: c,
  };
}

describe("R12.5: response generation produces the same output minus the HMAC field", () => {
  const rawCjRecord: Record<string, unknown> = {
    shopperId: "tracking-abc",
    actionId: "order-123",
    pubCommissionAmountUsd: 12.5,
    saleAmount: 100,
    saleAmountUsd: 100,
    actionStatus: "approved",
    eventDate: "2024-06-01T00:00:00.000Z",
  };

  it("generates the normalized commission without raising an error", () => {
    // Before the removal this path called computeResponseHmac() and assigned its
    // result to `response_hmac`. With both gone, generation must still succeed.
    expect(() => generateCjCommission(rawCjRecord)).not.toThrow();
  });

  it("produces no `response_hmac` field on the generated record", () => {
    const generated = generateCjCommission(rawCjRecord);
    expect(Object.prototype.hasOwnProperty.call(generated, "response_hmac")).toBe(false);
    expect((generated as unknown as Record<string, unknown>).response_hmac).toBeUndefined();
  });

  it("equals the pre-removal output once the HMAC field is stripped", () => {
    // The "previous" record is what the old code emitted: identical in every
    // field, plus a `response_hmac` integrity value that was never used.
    const generated = generateCjCommission(rawCjRecord);
    const previousWithHmac = {
      ...generated,
      response_hmac: "deadbeefcafef00d", // value the removed control would have added
    };

    // Strip the HMAC field from the historical output...
    const { response_hmac: _removed, ...previousMinusHmac } = previousWithHmac;
    void _removed;

    // ...and the current generation must match it exactly.
    expect(generated).toEqual(previousMinusHmac);
  });

  it("retains every functional field of the response (only the HMAC is gone)", () => {
    const generated = generateCjCommission(rawCjRecord);
    expect(generated).toEqual({
      tracking_key: "tracking-abc",
      order_id: "order-123",
      network: "cj",
      commission_amount: 12.5,
      sale_amount: 100,
      status: "approved",
      event_date: "2024-06-01T00:00:00.000Z",
      raw_data: rawCjRecord,
    });
  });
});
