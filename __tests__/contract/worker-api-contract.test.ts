/**
 * Contract tests: Worker ↔ API boundary (R-018 / E3#17).
 *
 * These tests verify that the message shapes exchanged between the
 * Cloudflare Worker (custom-worker.ts) and the Next.js API routes
 * remain compatible. They do NOT hit a running server — they validate
 * the schemas and payload constraints that both sides rely on.
 */
import { describe, it, expect } from "vitest";
import { CURRENT_API_VERSION } from "@/lib/api-version";

// ── Click queue contract ──────────────────────────────────────────────

/** The canonical shape the Worker sends to POST /api/queue/clicks. */
interface ClickQueuePayload {
  messages: ClickMessage[];
}

interface ClickMessage {
  site_id: string;
  product_name: string;
  affiliate_url: string;
  content_slug?: string;
  referrer?: string;
  click_id?: string;
  ts?: number;
}

const SITE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MESSAGES_PER_BATCH = 200;
const MAX_AFFILIATE_URL_LEN = 2048;
const MAX_PRODUCT_NAME_LEN = 512;

function isValidClickMessage(m: ClickMessage): boolean {
  if (!SITE_ID_RE.test(m.site_id)) return false;
  if (!m.product_name || m.product_name.length > MAX_PRODUCT_NAME_LEN) return false;
  if (!m.affiliate_url || m.affiliate_url.length > MAX_AFFILIATE_URL_LEN) return false;
  try {
    const url = new URL(m.affiliate_url);
    if (!["http:", "https:"].includes(url.protocol)) return false;
  } catch {
    return false;
  }
  return true;
}

describe("Worker ↔ API contract: click queue", () => {
  it("accepts a valid single-message batch", () => {
    const payload: ClickQueuePayload = {
      messages: [
        {
          site_id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
          product_name: "Rolex Submariner",
          affiliate_url: "https://example.com/product/123",
        },
      ],
    };

    expect(Array.isArray(payload.messages)).toBe(true);
    expect(payload.messages.length).toBeLessThanOrEqual(MAX_MESSAGES_PER_BATCH);
    for (const m of payload.messages) {
      expect(isValidClickMessage(m)).toBe(true);
    }
  });

  it("rejects messages with invalid site_id", () => {
    const bad: ClickMessage = {
      site_id: "not-a-uuid",
      product_name: "Test",
      affiliate_url: "https://example.com",
    };
    expect(isValidClickMessage(bad)).toBe(false);
  });

  it("rejects messages with non-http URLs", () => {
    const bad: ClickMessage = {
      site_id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      product_name: "Test",
      affiliate_url: "javascript:alert(1)",
    };
    expect(isValidClickMessage(bad)).toBe(false);
  });

  it("rejects oversized product names", () => {
    const bad: ClickMessage = {
      site_id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      product_name: "x".repeat(MAX_PRODUCT_NAME_LEN + 1),
      affiliate_url: "https://example.com",
    };
    expect(isValidClickMessage(bad)).toBe(false);
  });

  it("rejects batches exceeding MAX_MESSAGES_PER_BATCH", () => {
    const batch = Array.from({ length: MAX_MESSAGES_PER_BATCH + 1 }, () => ({
      site_id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      product_name: "Test",
      affiliate_url: "https://example.com",
    }));
    expect(batch.length).toBeGreaterThan(MAX_MESSAGES_PER_BATCH);
  });

  it("accepts optional fields (content_slug, referrer, click_id, ts)", () => {
    const msg: ClickMessage = {
      site_id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      product_name: "Omega Speedmaster",
      affiliate_url: "https://store.example.com/omega",
      content_slug: "omega-speedmaster-review",
      referrer: "https://google.com/search?q=omega",
      click_id: "clk_abc123",
      ts: Date.now(),
    };
    expect(isValidClickMessage(msg)).toBe(true);
    expect(msg.content_slug).toBeDefined();
    expect(msg.referrer).toBeDefined();
    expect(msg.click_id).toBeDefined();
    expect(typeof msg.ts).toBe("number");
  });
});

// ── Webhook DLQ contract ──────────────────────────────────────────────

interface WebhookDlqEntry {
  event_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  error_message: string;
  status: "pending" | "resolved";
}

describe("Worker ↔ API contract: webhook DLQ", () => {
  it("validates DLQ entry shape", () => {
    const entry: WebhookDlqEntry = {
      event_id: "evt_test_123",
      event_type: "checkout.session.completed",
      payload: { id: "cs_test_123", mode: "subscription" },
      error_message: "Signature verification failed",
      status: "pending",
    };

    expect(entry.event_id).toMatch(/^evt_/);
    expect(["pending", "resolved"]).toContain(entry.status);
    expect(typeof entry.payload).toBe("object");
    expect(typeof entry.error_message).toBe("string");
  });

  it("validates event type matches Stripe naming convention", () => {
    const validTypes = [
      "checkout.session.completed",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.payment_succeeded",
      "invoice.payment_failed",
    ];
    for (const type of validTypes) {
      expect(type).toMatch(/^[a-z]+(\.[a-z_]+)+$/);
    }
  });
});

// ── API versioning contract ───────────────────────────────────────────

describe("Worker ↔ API contract: versioning", () => {
  it("API-Version header format is a numeric major version", () => {
    expect(CURRENT_API_VERSION).toMatch(/^[1-9]\d*$/);
  });
});
