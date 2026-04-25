/**
 * Distributed rate limiter using Cloudflare KV with in-memory fallback.
 *
 * In production (Cloudflare Workers), counters are stored in KV so they
 * persist across cold starts and are shared across isolates.
 *
 * In local development (or when KV is unavailable), falls back to a
 * per-process in-memory store — acceptable for dev but NOT for production.
 *
 * F-3 — when KV is unexpectedly unavailable in production (binding
 * missing or `get`/`put` throws), the limiter falls back to the
 * per-isolate in-memory store for a bounded grace window
 * (KV_GRACE_MS, default 60s). After the grace window elapses without
 * KV recovering, the limiter fails CLOSED — every rate-limited
 * request is rejected with a 429-equivalent result. The grace window
 * exists so transient KV glitches (cold-start races, brief network
 * blips) don't briefly brick public endpoints (newsletter, /r/, login,
 * unsubscribe), but caps the window during which an attacker can
 * exploit per-isolate in-memory limits when KV is persistently broken.
 *
 * The KV-availability state is tracked per-isolate; a successful KV
 * call resets the state so the next outage starts a fresh grace
 * window. The first failure fires a Sentry alert and emits a
 * `rate_limit_kv_failopen` log line that operators can scrape into a
 * burn-rate metric.
 */

import { captureException } from "@/lib/sentry";

// ── Durable Object binding types ────────────────────────────────────
// Minimal structural types for the RATE_LIMITER_DO binding so this file
// type-checks without pulling in @cloudflare/workers-types.

interface DurableObjectStub {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface DurableObjectId {
  readonly name?: string;
}

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

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

// ── Binding lookup helpers ──────────────────────────────────────────
// Cloudflare Worker bindings are exposed via the @opennextjs/cloudflare
// `process.env` shim at runtime. Node's real `process.env` coerces values
// to strings, so in test environments we also look up on `globalThis` —
// this lets Vitest set a mock binding via `vi.stubGlobal(...)` without
// relying on the production shim.

function readBinding(name: string): unknown {
  const fromGlobal = (globalThis as Record<string, unknown>)[name];
  if (fromGlobal !== undefined) return fromGlobal;
  try {
    return (process.env as Record<string, unknown>)[name];
  } catch {
    return undefined;
  }
}

// ── Durable Object-based implementation (F-005, preferred) ──────────

/**
 * Attempt to get the Durable Object namespace bound as RATE_LIMITER_DO.
 * When present, it is preferred over KV because the DO provides atomic
 * per-key read-modify-write semantics — closing the race window that
 * the KV implementation leaves open.
 */
function getRateLimiterDO(): DurableObjectNamespace | undefined {
  const ns = readBinding("RATE_LIMITER_DO");
  if (ns && typeof ns === "object" && "idFromName" in ns && "get" in ns) {
    return ns as unknown as DurableObjectNamespace;
  }
  return undefined;
}

async function checkRateLimitDO(
  ns: DurableObjectNamespace,
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const id = ns.idFromName(key);
  const stub = ns.get(id);

  const response = await stub.fetch("https://rate-limiter/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key,
      maxRequests: config.maxRequests,
      windowMs: config.windowMs,
    }),
  });

  if (!response.ok) {
    throw new Error(`RATE_LIMITER_DO responded ${response.status}`);
  }

  return (await response.json()) as RateLimitResult;
}

// ── KV-based implementation (fallback) ──────────────────────────────

/**
 * Attempt to get the KV namespace bound as RATE_LIMIT_KV.
 * On Cloudflare Workers the binding is available via process.env shim
 * provided by @opennextjs/cloudflare.
 * Returns undefined when running outside Workers (local dev).
 */
export function getKVNamespace(): KVNamespace | undefined {
  const kv = readBinding("RATE_LIMIT_KV");
  if (kv && typeof kv === "object" && "get" in kv && "put" in kv) {
    return kv as unknown as KVNamespace;
  }
  return undefined;
}

/**
 * Fixed-window counter stored in KV.
 *
 * Uses a window-bucketed key (`rate:{key}:{windowId}`) with a simple integer
 * counter instead of a timestamp array.  This minimises the data written on
 * each request and narrows the read-then-write race window to a single
 * integer increment — far less exploitable than the previous get→filter→
 * push→put pattern on a full JSON array.
 *
 * NOTE: Cloudflare KV does not support atomic compare-and-swap, so a small
 * race still exists under extreme concurrency.  For strict per-key atomicity
 * migrate to Durable Objects or the Cloudflare Rate Limiting API.
 */
interface KVCounterData {
  count: number;
}

async function checkRateLimitKV(
  kv: KVNamespace,
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowId = Math.floor(now / config.windowMs);
  const kvKey = `rate:${key}:${windowId}`;
  const ttlSeconds = Math.ceil(config.windowMs / 1000) + 1;

  const existing = (await kv.get(kvKey, "json")) as KVCounterData | null;
  const currentCount = existing?.count ?? 0;

  if (currentCount >= config.maxRequests) {
    const windowStart = windowId * config.windowMs;
    const windowEnd = windowStart + config.windowMs;
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(windowEnd - now, 0),
    };
  }

  await kv.put(kvKey, JSON.stringify({ count: currentCount + 1 }), {
    expirationTtl: ttlSeconds,
  });

  return {
    allowed: true,
    remaining: config.maxRequests - (currentCount + 1),
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
 * Falls back to in-memory store in local development, or — per F-3 —
 * in production for a bounded grace window when KV is unexpectedly
 * unavailable.
 */
let kvFallbackWarned = false;
let kvUnavailableAlerted = false;
/** Epoch ms at which KV first became unavailable in this isolate; null when KV is healthy. */
let kvUnavailableSince: number | null = null;

/**
 * Grace window during which the limiter falls back to per-isolate memory
 * when KV is unavailable. After the window elapses without recovery the
 * limiter fails closed. Overridable via RATE_LIMIT_KV_GRACE_MS for ops drills.
 */
const DEFAULT_KV_GRACE_MS = 60_000;

function getKvGraceMs(): number {
  const raw = process.env.RATE_LIMIT_KV_GRACE_MS;
  if (!raw) return DEFAULT_KV_GRACE_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_KV_GRACE_MS;
}

/** Reset internal KV-availability state. Exported for tests. */
export function __resetRateLimitKvStateForTests(): void {
  kvFallbackWarned = false;
  kvUnavailableAlerted = false;
  kvUnavailableSince = null;
}

function markKvAvailable(): void {
  kvUnavailableAlerted = false;
  kvUnavailableSince = null;
}

/**
 * KV is unavailable (binding missing or get/put threw). In production,
 * fall back to the in-memory limiter for KV_GRACE_MS; after the grace
 * window elapses without KV recovering, fail CLOSED. In development,
 * fall back to memory indefinitely (existing behaviour).
 */
function handleKvUnavailable(
  key: string,
  config: RateLimitConfig,
  reason: string,
  err?: unknown,
): RateLimitResult {
  const isProduction = process.env.NODE_ENV === "production" || typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

  if (!isProduction && !kvFallbackWarned) {
    kvFallbackWarned = true;
    console.warn(
      "[rate-limit] KV namespace RATE_LIMIT_KV not available — using in-memory fallback. " +
        "This is expected in local dev but NOT safe for production. " +
        "See lib/rate-limit.ts for KV configuration instructions.",
    );
  }

  const now = Date.now();
  if (kvUnavailableSince === null) {
    kvUnavailableSince = now;
  }

  if (isProduction && !kvUnavailableAlerted) {
    kvUnavailableAlerted = true;
    const msg =
      `[rate-limit] WARNING: KV unavailable (${reason}). ` +
      `Falling back to per-isolate memory for up to ${getKvGraceMs()}ms; ` +
      "after the grace window elapses requests will fail CLOSED. " +
      "Configure the KV binding in wrangler.jsonc to restore distributed rate limiting.";
    console.error(msg);
    // Structured line for log-based metric (rate_limit_kv_failopen).
    console.error(
      JSON.stringify({
        metric: "rate_limit_kv_failopen",
        reason,
        grace_ms: getKvGraceMs(),
      }),
    );
    captureException(err ?? new Error(msg), {
      context: "rate-limit.kv-unavailable-fail-open",
      extra: { reason, graceMs: getKvGraceMs() },
    });
  }

  const graceMs = getKvGraceMs();
  if (isProduction && now - kvUnavailableSince >= graceMs) {
    // Grace expired: fail closed. Use the smaller of (graceMs, configured window)
    // for retryAfter so clients back off but eventually retry.
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.min(graceMs, config.windowMs),
    };
  }

  return checkRateLimitMemory(key, config);
}

export async function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  // Prefer the Durable Object — it's atomic, so race-free under concurrency.
  const doNs = getRateLimiterDO();
  if (doNs) {
    try {
      return await checkRateLimitDO(doNs, key, config);
    } catch (err) {
      // DO is bound but unreachable (deploy glitch, etc.): log and fall
      // through to KV rather than fail-closing the entire endpoint.
      captureException(err, { context: "rate-limit.do-unavailable" });
    }
  }

  const kv = getKVNamespace();
  if (kv) {
    try {
      const result = await checkRateLimitKV(kv, key, config);
      markKvAvailable();
      return result;
    } catch (err) {
      // KV binding is present but a get/put threw — treat as an
      // availability failure and fall through to the F-3 grace path.
      return handleKvUnavailable(key, config, "kv-get-or-put-threw", err);
    }
  }

  return handleKvUnavailable(key, config, "binding-missing");
}
