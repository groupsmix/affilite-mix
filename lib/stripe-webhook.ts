/**
 * Stripe webhook signature verification using Web Crypto (HMAC-SHA256).
 *
 * Matches the behaviour of `stripe.webhooks.constructEvent` without
 * requiring the `stripe` npm package. The existing Stripe integration
 * in this repo intentionally uses the raw HTTP API (see
 * `app/api/membership/checkout/route.ts`) to keep the Cloudflare
 * Workers bundle small, so we mirror that pattern here.
 *
 * Stripe signs webhook payloads by sending a `Stripe-Signature` header
 * of the form:
 *
 *     t=<timestamp>,v1=<hex_signature>[,v1=<hex_signature>…][,v0=…]
 *
 * The signed payload is `<timestamp>.<rawBody>`, HMAC-SHA256'd with
 * the endpoint's webhook secret. A signature is valid when:
 *
 *   - the timestamp is within `tolerance` seconds of now (replay
 *     protection — default 5 minutes, same as Stripe's SDK);
 *   - at least one `v1=` signature in the header matches the expected
 *     HMAC of the signed payload, compared in constant time.
 *
 * Returns the parsed JSON event on success (including its `id`, used
 * for idempotency), or throws a `StripeSignatureError` on failure.
 */

import { logger } from "@/lib/logger";

export class StripeSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeSignatureError";
  }
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
  [k: string]: unknown;
}

const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

// FIX-13 (F-004): Pre-warm the HMAC crypto key on cold start so the first
// webhook verification doesn't pay the importKey() latency penalty.
// On Cloudflare Workers, the first request after a cold start can take
// 50-100ms extra for crypto.subtle.importKey(). Pre-warming eliminates
// this tail-latency spike for the critical Stripe webhook path.
let _prewarmedKey: CryptoKey | null = null;
let _prewarmSecret: string | null = null;

/** Pre-warm the HMAC key for a given webhook secret. Call on cold start. */
export async function prewarmStripeWebhookKey(secret: string): Promise<void> {
  if (!secret) return;
  const encoder = new TextEncoder();
  _prewarmedKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  _prewarmSecret = secret;
}

/** Get the pre-warmed key if the secret matches, otherwise create a new one. */
async function getHmacKey(secret: string): Promise<CryptoKey> {
  if (_prewarmedKey && _prewarmSecret === secret) return _prewarmedKey;
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function parseSignatureHeader(header: string): { timestamp: number; v1: string[] } {
  let timestamp = 0;
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") {
      timestamp = Number.parseInt(value, 10);
    } else if (key === "v1") {
      v1.push(value);
    }
  }
  if (!timestamp || !Number.isFinite(timestamp) || v1.length === 0) {
    throw new StripeSignatureError("Malformed Stripe-Signature header");
  }
  return { timestamp, v1 };
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(hex.substr(i * 2, 2), 16);
    if (Number.isNaN(byte)) return null;
    out[i] = byte;
  }
  return out;
}

/** Constant-time equality for two byte arrays. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

async function computeExpectedSignature(
  secret: string,
  signedPayload: string,
): Promise<Uint8Array> {
  const key = await getHmacKey(secret);
  const encoder = new TextEncoder();
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
  return new Uint8Array(sig);
}

/**
 * Verify a Stripe webhook signature and parse the event payload.
 *
 * @param rawBody   The exact request body bytes as received (must not
 *                  be re-serialized or whitespace-normalized).
 * @param signature Value of the `Stripe-Signature` request header.
 * @param secret    The webhook endpoint's signing secret (`whsec_…`).
 * @param toleranceSeconds How stale a signed timestamp may be. Defaults
 *                  to 5 minutes, matching Stripe's SDK.
 */
export async function constructStripeEvent(
  rawBody: string,
  signature: string | null | undefined,
  secret: string,
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS,
): Promise<StripeEvent> {
  if (!signature) {
    throw new StripeSignatureError("Missing Stripe-Signature header");
  }
  if (!secret) {
    throw new StripeSignatureError("Missing webhook signing secret");
  }

  const { timestamp, v1 } = parseSignatureHeader(signature);

  // FIX-13 (F-022): Log Stripe-Signature schema version for monitoring.
  // Stripe has used v1 since 2017; if they introduce v2, we need to know
  // so we can update verification logic before v1 is deprecated.
  const hasV0 = signature.includes("v0=");
  if (hasV0) {
    logger.info("Stripe-Signature contains v0 component — monitor for v1 deprecation", {
      metric: "stripe_webhook_signature_version",
      version: "v0",
    });
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    throw new StripeSignatureError("Timestamp outside tolerance window");
  }

  const expected = await computeExpectedSignature(secret, `${timestamp}.${rawBody}`);

  let matched = false;
  for (const candidate of v1) {
    const bytes = hexToBytes(candidate);
    if (!bytes) continue;
    if (timingSafeEqual(expected, bytes)) {
      matched = true;
      break;
    }
  }

  if (!matched) {
    throw new StripeSignatureError("Signature mismatch");
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    // fail-closed: invalid JSON is rejected [criticality:security-critical]
    throw new StripeSignatureError("Invalid JSON payload");
  }
  if (!event || typeof event !== "object" || typeof event.id !== "string") {
    throw new StripeSignatureError("Payload missing event id");
  }
  return event;
}
