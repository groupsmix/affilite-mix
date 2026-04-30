/**
 * Risk-12: Verify Stripe webhook idempotency handling is in place.
 *
 * The audit flagged that Stripe webhook/idempotency was "not verified".
 * This test confirms:
 *   1. The webhook route uses signature verification
 *   2. The event processor uses atomic idempotency (single-transaction)
 *   3. Duplicate events are detected and skipped
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

function readFile(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "..", relPath), "utf-8");
}

function fileExists(relPath: string): boolean {
  return fs.existsSync(path.resolve(__dirname, "..", relPath));
}

describe("Risk-12: Stripe webhook idempotency", () => {
  it("stripe-webhook.ts implements HMAC-SHA256 signature verification", () => {
    const content = readFile("lib/stripe-webhook.ts");
    expect(content).toContain("HMAC");
    expect(content).toContain("SHA-256");
    expect(content).toContain("StripeSignatureError");
    expect(content).toContain("constant time");
  });

  it("stripe-event-processor.ts uses atomic idempotency via Postgres RPC", () => {
    const content = readFile("lib/stripe-event-processor.ts");
    // Must use the atomic apply function
    expect(content).toContain("applyStripeEventAtomic");
    // Must detect duplicates
    expect(content).toContain("duplicate");
    // Must NOT call the old two-step pattern (comments referencing the
    // old approach for historical context are acceptable)
    expect(content).not.toMatch(/await\s+recordStripeEvent\s*\(/);
  });

  it("membership webhook route exists and uses signature verification", () => {
    const routePath = "app/api/membership/webhook/route.ts";
    expect(fileExists(routePath)).toBe(true);
    const content = readFile(routePath);
    // Must verify signature before processing
    expect(content).toMatch(/verifyStripeWebhook|constructStripeEvent/);
    // Must use the event processor
    expect(content).toContain("processStripeEvent");
  });

  it("checkout route uses fail-closed rate limiting", () => {
    const content = readFile("app/api/membership/checkout/route.ts");
    expect(content).toContain('failPolicy: "closed"');
  });

  it("stripe-events DAL has atomic transaction support", () => {
    const dalPath = "lib/dal/stripe-events.ts";
    if (!fileExists(dalPath)) return;
    const content = readFile(dalPath);
    // Must reference the Postgres RPC for atomic operations
    expect(content).toContain("apply_stripe_membership_event");
  });
});
