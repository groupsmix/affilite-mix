/**
 * F-CRYPTO-01: Fuzz test for Stripe webhook signature verification.
 *
 * Generates valid and mutated signatures to ensure the custom HMAC-SHA256
 * verification rejects all tampered payloads and accepts all valid ones.
 */
import { describe, it, expect } from "vitest";
import { constructStripeEvent, StripeSignatureError } from "@/lib/stripe-webhook";

const TEST_SECRET = "whsec_test_secret_for_fuzz_testing";

async function computeHmacSha256(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function makeValidEvent(id: string = "evt_test_123") {
  return JSON.stringify({
    id,
    type: "checkout.session.completed",
    data: { object: { id: "cs_test_123" } },
  });
}

async function makeValidSignature(
  body: string,
  secret: string,
  timestampOverride?: number,
): Promise<{ header: string; timestamp: number }> {
  const timestamp = timestampOverride ?? Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${body}`;
  const sig = await computeHmacSha256(secret, signedPayload);
  return { header: `t=${timestamp},v1=${sig}`, timestamp };
}

describe("F-CRYPTO-01: Stripe webhook signature verification", () => {
  describe("valid signatures", () => {
    it("accepts a correctly signed payload", async () => {
      const body = makeValidEvent();
      const { header } = await makeValidSignature(body, TEST_SECRET);
      const event = await constructStripeEvent(body, header, TEST_SECRET);
      expect(event.id).toBe("evt_test_123");
    });

    it("accepts multiple v1 signatures where at least one matches", async () => {
      const body = makeValidEvent();
      const { header } = await makeValidSignature(body, TEST_SECRET);
      const multiHeader = `${header},v1=0000000000000000000000000000000000000000000000000000000000000000`;
      const event = await constructStripeEvent(body, multiHeader, TEST_SECRET);
      expect(event.id).toBe("evt_test_123");
    });

    it("accepts a timestamp exactly at the tolerance boundary (300s)", async () => {
      const body = makeValidEvent();
      const now = Math.floor(Date.now() / 1000);
      const { header } = await makeValidSignature(body, TEST_SECRET, now - 299);
      const event = await constructStripeEvent(body, header, TEST_SECRET);
      expect(event.id).toBe("evt_test_123");
    });
  });

  describe("timestamp tolerance", () => {
    it("rejects a signature older than 5 minutes", async () => {
      const body = makeValidEvent();
      const staleTimestamp = Math.floor(Date.now() / 1000) - 301;
      const { header } = await makeValidSignature(body, TEST_SECRET, staleTimestamp);
      await expect(constructStripeEvent(body, header, TEST_SECRET)).rejects.toThrow(
        StripeSignatureError,
      );
    });

    it("rejects a signature from the future beyond tolerance", async () => {
      const body = makeValidEvent();
      const futureTimestamp = Math.floor(Date.now() / 1000) + 301;
      const { header } = await makeValidSignature(body, TEST_SECRET, futureTimestamp);
      await expect(constructStripeEvent(body, header, TEST_SECRET)).rejects.toThrow(
        "Timestamp outside tolerance window",
      );
    });
  });

  describe("mutated signatures", () => {
    it("rejects a signature signed with a different secret", async () => {
      const body = makeValidEvent();
      const { header } = await makeValidSignature(body, "whsec_wrong_secret");
      await expect(constructStripeEvent(body, header, TEST_SECRET)).rejects.toThrow(
        "Signature mismatch",
      );
    });

    it("rejects when the body has been tampered with", async () => {
      const body = makeValidEvent();
      const { header } = await makeValidSignature(body, TEST_SECRET);
      const tamperedBody = body.replace("evt_test_123", "evt_evil_456");
      await expect(constructStripeEvent(tamperedBody, header, TEST_SECRET)).rejects.toThrow(
        "Signature mismatch",
      );
    });

    it("rejects a truncated signature", async () => {
      const body = makeValidEvent();
      const { header } = await makeValidSignature(body, TEST_SECRET);
      const truncated = header.replace(/v1=.{64}/, "v1=" + "a".repeat(32));
      await expect(constructStripeEvent(body, truncated, TEST_SECRET)).rejects.toThrow(
        "Signature mismatch",
      );
    });

    it("accepts hex case variants (implementation uses parseInt which is case-insensitive)", async () => {
      const body = makeValidEvent();
      const { header } = await makeValidSignature(body, TEST_SECRET);
      const upperCased = header.replace(
        /v1=([0-9a-f]+)/,
        (_, sig: string) => `v1=${sig.toUpperCase()}`,
      );
      const event = await constructStripeEvent(body, upperCased, TEST_SECRET);
      expect(event.id).toBe("evt_test_123");
    });

    it("trims leading whitespace in signature value (parseSignatureHeader trims)", async () => {
      const body = makeValidEvent();
      const { header } = await makeValidSignature(body, TEST_SECRET);
      const whitespaced = header.replace("v1=", "v1= ");
      const event = await constructStripeEvent(body, whitespaced, TEST_SECRET);
      expect(event.id).toBe("evt_test_123");
    });

    it("rejects an empty signature header", async () => {
      const body = makeValidEvent();
      await expect(constructStripeEvent(body, "", TEST_SECRET)).rejects.toThrow(
        StripeSignatureError,
      );
    });

    it("rejects a null signature header", async () => {
      const body = makeValidEvent();
      await expect(constructStripeEvent(body, null, TEST_SECRET)).rejects.toThrow(
        "Missing Stripe-Signature header",
      );
    });

    it("rejects a missing webhook secret", async () => {
      const body = makeValidEvent();
      const { header } = await makeValidSignature(body, TEST_SECRET);
      await expect(constructStripeEvent(body, header, "")).rejects.toThrow(
        "Missing webhook signing secret",
      );
    });

    it("rejects a signature with no v1 scheme", async () => {
      const body = makeValidEvent();
      const ts = Math.floor(Date.now() / 1000);
      const header = `t=${ts},v0=abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890`;
      await expect(constructStripeEvent(body, header, TEST_SECRET)).rejects.toThrow(
        "Malformed Stripe-Signature header",
      );
    });

    it("rejects a signature with invalid hex characters", async () => {
      const body = makeValidEvent();
      const ts = Math.floor(Date.now() / 1000);
      const header = `t=${ts},v1=${"zz".repeat(32)}`;
      await expect(constructStripeEvent(body, header, TEST_SECRET)).rejects.toThrow(
        "Signature mismatch",
      );
    });

    it("rejects an odd-length hex signature", async () => {
      const body = makeValidEvent();
      const ts = Math.floor(Date.now() / 1000);
      const header = `t=${ts},v1=${"a".repeat(63)}`;
      await expect(constructStripeEvent(body, header, TEST_SECRET)).rejects.toThrow(
        "Signature mismatch",
      );
    });
  });

  describe("malformed payloads", () => {
    it("rejects non-JSON body", async () => {
      const body = "not json at all";
      const { header } = await makeValidSignature(body, TEST_SECRET);
      await expect(constructStripeEvent(body, header, TEST_SECRET)).rejects.toThrow(
        "Invalid JSON payload",
      );
    });

    it("rejects JSON body missing event id", async () => {
      const body = JSON.stringify({ type: "test", data: {} });
      const { header } = await makeValidSignature(body, TEST_SECRET);
      await expect(constructStripeEvent(body, header, TEST_SECRET)).rejects.toThrow(
        "Payload missing event id",
      );
    });
  });
});
