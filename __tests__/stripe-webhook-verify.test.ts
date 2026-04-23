/**
 * Unit tests for `lib/stripe-webhook.ts`.
 *
 * Exercises the real HMAC-SHA256 signature verification against the
 * Web Crypto API exposed on Node 20+ (`globalThis.crypto.subtle`).
 */

import { describe, it, expect } from "vitest";
import { constructStripeEvent, StripeSignatureError } from "@/lib/stripe-webhook";

const SECRET = "whsec_test_secret";

async function sign(payload: string, secret: string, timestamp: number): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${payload}`));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `t=${timestamp},v1=${hex}`;
}

describe("constructStripeEvent", () => {
  it("accepts a valid signature and returns the parsed event", async () => {
    const payload = JSON.stringify({
      id: "evt_123",
      type: "checkout.session.completed",
      data: { object: { id: "cs_1" } },
    });
    const header = await sign(payload, SECRET, Math.floor(Date.now() / 1000));
    const event = await constructStripeEvent(payload, header, SECRET);
    expect(event.id).toBe("evt_123");
    expect(event.type).toBe("checkout.session.completed");
  });

  it("rejects a missing Stripe-Signature header", async () => {
    await expect(constructStripeEvent("{}", null, SECRET)).rejects.toBeInstanceOf(
      StripeSignatureError,
    );
  });

  it("rejects a tampered payload", async () => {
    const original = JSON.stringify({ id: "evt_x", type: "t", data: { object: {} } });
    const header = await sign(original, SECRET, Math.floor(Date.now() / 1000));
    const tampered = original.replace('"type":"t"', '"type":"hacked"');
    await expect(constructStripeEvent(tampered, header, SECRET)).rejects.toThrow(
      StripeSignatureError,
    );
  });

  it("rejects a signature signed with the wrong secret", async () => {
    const payload = JSON.stringify({ id: "evt_y", type: "t", data: { object: {} } });
    const header = await sign(payload, "whsec_other", Math.floor(Date.now() / 1000));
    await expect(constructStripeEvent(payload, header, SECRET)).rejects.toThrow(
      StripeSignatureError,
    );
  });

  it("rejects a stale timestamp (replay protection)", async () => {
    const payload = JSON.stringify({ id: "evt_z", type: "t", data: { object: {} } });
    const stale = Math.floor(Date.now() / 1000) - 60 * 60; // 1h old
    const header = await sign(payload, SECRET, stale);
    await expect(constructStripeEvent(payload, header, SECRET)).rejects.toThrow(
      StripeSignatureError,
    );
  });

  it("rejects a malformed signature header", async () => {
    await expect(constructStripeEvent("{}", "not-a-valid-header", SECRET)).rejects.toThrow(
      StripeSignatureError,
    );
  });

  it("rejects a payload that is not valid JSON even when the signature matches", async () => {
    const raw = "definitely-not-json";
    const header = await sign(raw, SECRET, Math.floor(Date.now() / 1000));
    await expect(constructStripeEvent(raw, header, SECRET)).rejects.toThrow(StripeSignatureError);
  });

  it("rejects a payload without a string event id", async () => {
    const payload = JSON.stringify({ type: "no_id", data: { object: {} } });
    const header = await sign(payload, SECRET, Math.floor(Date.now() / 1000));
    await expect(constructStripeEvent(payload, header, SECRET)).rejects.toThrow(
      StripeSignatureError,
    );
  });
});
