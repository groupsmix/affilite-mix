/**
 * Distributed rate limiter using Cloudflare KV with in-memory fallback.
 *
 * In production (Cloudflare Workers), counters are stored in KV so they
 * persist across cold starts and are shared across isolates.
 *
 * In local development (or when KV is unavailable), falls back to a
 * per-process in-memory store — acceptable for dev but NOT for production.
 */

import { captureException } from "@/lib/sentry";

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

// ── KV-based implementation (production) ────────────────────────────

/**
 * Attempt to get the KV namespace bound as RATE_LIMIT_KV.
 * On Cloudflare Workers the binding is available via process.env shim
 * provided by @opennextjs/cloudflare.
 * Returns undefined when running outside Workers (local dev).
 */
function getKVNamespace(): KVNamespace | undefined {
  try {
    const kv = (process.env as Record<string, unknown>).RATE_LIMIT_KV;
    if (kv && typeof kv === "object" && "get" in kv && "put" in kv) {
      return kv as unknown as KVNamespace;
    }
  } catch {
    // Not running in Workers — fall through
  }
  return undefined;
}

interface KVRateLimitData {
  timestamps: number[];
}

async function checkRateLimitKV(
  kv: KVNamespace,
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const now = Date.now();
  const cutoff = now - config.windowMs;
  const kvKey = `rate:${key}`;

  const existing = (await kv.get(kvKey, "json")) as KVRateLimitData | null;
  const timestamps = existing ? existing.timestamps.filter((t) => t > cutoff) : [];

  if (timestamps.length >= config.maxRequests) {
    const oldestInWindow = timestamps[0];
    const retryAfterMs = oldestInWindow + config.windowMs - now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(retryAfterMs, 0),
    };
  }

  timestamps.push(now);

  const ttlSeconds = Math.ceil(config.windowMs / 1000);
  await kv.put(kvKey, JSON.stringify({ timestamps }), {
    expirationTtl: ttlSeconds,
  });

  return {
    allowed: true,
    remaining: config.maxRequests - timestamps.length,
    retryAfterMs: 0,
  };
}

// ── In-memory fallback (local dev) ──────────────────────────────────
// WARNING: The in-memory fallback is per-isolate on Cloudflare Workers.
// An attacker can bypass rate limits by hitting different isolates.
// Implement distributed rate limiting via Cloudflare KV or Durable Objects
// before scaling to significant traffic.
//
// To configure KV for production:
//   1. Create a KV namespace: wrangler kv:namespace create RATE_LIMIT_KV
//   2. Add the binding to wrangler.jsonc under [kv_namespaces]
//   3. Verify with: wrangler kv:key list --namespace-id=<ID>

interface MemoryRateLimitEntry {
  timestamps: number[];
}

const memoryStore = new Map<string, MemoryRateLimitEntry>();

const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanupMemory(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  const cutoff = now - windowMs;
  for (const [key, entry] of memoryStore) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) {
      memoryStore.delete(key);
    }
  }
}

function checkRateLimitMemory(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const cutoff = now - config.windowMs;

  cleanupMemory(config.windowMs);

  let entry = memoryStore.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    memoryStore.set(key, entry);
  }

  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= config.maxRequests) {
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = oldestInWindow + config.windowMs - now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(retryAfterMs, 0),
    };
  }

  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: config.maxRequests - entry.timestamps.length,
    retryAfterMs: 0,
  };
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Check and record a request against the rate limit.
 *
 * Uses Cloudflare KV in production for distributed rate limiting.
 * Falls back to in-memory store in local development.
 */
let kvFallbackWarned = false;

export async function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const kv = getKVNamespace();
  if (kv) {
    return checkRateLimitKV(kv, key, config);
  }

  // In production, fail closed: reject requests when KV is unavailable
  // rather than falling through to per-isolate in-memory rate limiting
  // that an attacker can trivially bypass.
  if (process.env.NODE_ENV === "production") {
    if (!kvFallbackWarned) {
      kvFallbackWarned = true;
      const msg =
        "[rate-limit] CRITICAL: KV namespace RATE_LIMIT_KV not available in production. " +
        "Rate-limited requests will be rejected. " +
        "Configure the KV binding in wrangler.jsonc to restore service. " +
        "See lib/rate-limit.ts for KV configuration instructions.";
      console.error(msg);
      // Also fire a Sentry alert so this misconfiguration does not silently
      // take down every public endpoint (newsletter, tracking, unsubscribe)
      // behind the fail-closed policy.
      captureException(new Error(msg), {
        context: "rate-limit.kv-unavailable",
      });
    }
    return { allowed: false, remaining: 0, retryAfterMs: 60_000 };
  }

  // In local development, fall back to in-memory rate limiting.
  if (!kvFallbackWarned) {
    kvFallbackWarned = true;
    console.warn(
      "[rate-limit] KV namespace RATE_LIMIT_KV not available — using in-memory fallback. " +
        "This is expected in local dev but NOT safe for production. " +
        "See lib/rate-limit.ts for KV configuration instructions.",
    );
  }

  return checkRateLimitMemory(key, config);
}
