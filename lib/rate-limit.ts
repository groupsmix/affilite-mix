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

import { captureException, captureMessage } from "@/lib/sentry";
import { logger } from "@/lib/logger";
import { getRuntimeEnv } from "@/lib/runtime-env";

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

type RateLimitFailPolicy = "grace" | "open" | "closed";

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
  /**
   * Per-route fail-open/closed policy when the distributed rate limiter
   * (KV or DO) is unavailable.
   *
   * - "grace" (default): fall back to in-memory for KV_GRACE_MS, then fail closed.
   *   This is the global F-3 behaviour and is safe for most public routes.
   * - "open": always allow requests when KV is unavailable.
   *   Use for non-critical public endpoints where availability is more important
   *   than strict rate-limiting during an outage (e.g. click tracking, health).
   * - "closed": immediately reject requests when KV is unavailable.
   *   Use for security-critical routes (e.g. login, admin, checkout).
   */
  failPolicy?: RateLimitFailPolicy;
  /**
   * FIX-07 (F-015): Override the grace window for this specific check.
   * When set, overrides the global KV_GRACE_MS for "grace" fail policy.
   * Use a shorter window (e.g. 5000ms) for sensitive endpoints so the
   * per-isolate fallback window is minimal, reducing the attack surface
   * when KV/DO is persistently broken.
   */
  graceMs?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

// ── Binding lookup helpers ──────────────────────────────────────────
// C-4: Replaced the duplicated require("@opennextjs/cloudflare") call
// with getRuntimeEnv() from lib/runtime-env.ts — the single source of
// truth for Cloudflare binding resolution. Test environments use
// `vi.stubGlobal(...)` stubs which getRuntimeEnv() also handles.

function readBinding(name: string): unknown {
  const fromGlobal = (globalThis as Record<string, unknown>)[name];
  if (fromGlobal !== undefined) return fromGlobal;
  const env = getRuntimeEnv();
  return env[name];
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

  const result = (await response.json()) as RateLimitResult;

  // A-022: Poisoning sanity check — detect a compromised or buggy DO.
  const isPoisoned =
    typeof result.allowed !== "boolean" ||
    typeof result.remaining !== "number" ||
    typeof result.retryAfterMs !== "number" ||
    result.remaining < -1 ||
    result.retryAfterMs < 0 ||
    result.retryAfterMs > config.windowMs * 10;

  if (isPoisoned) {
    captureException(new Error(`RATE_LIMITER_DO returned poisoned result for key ${key}`), {
      context: "rate-limit.do-poisoned",
      extra: { result, config },
    });
    // Fail closed on a poisoned DO — treat as rate-limited.
    return { allowed: false, remaining: 0, retryAfterMs: config.windowMs };
  }

  return result;
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

/** A98-51: Memory entry with timestamps and last-access tracking for LRU. */
interface MemoryRateLimitEntry {
  timestamps: number[];
  /** Epoch ms of last access — drives LRU eviction when cap is hit. */
  lastAccess: number;
}

const memoryStore = new Map<string, MemoryRateLimitEntry>();

/**
 * A75/A78/A99-1: Hard cap on in-memory rate-limit entries to prevent unbounded
 * memory growth between cleanup intervals. When the cap is hit, entries
 * are evicted by least-recently-used (LRU) order, not FIFO insertion order.
 *
 * A99-1: The previous hard-coded 10K cap fills in seconds at 100× traffic,
 * evicting IP counters and effectively disabling rate limiting. The cap is
 * now configurable via RATE_LIMIT_MEMORY_MAX_ENTRIES (clamped to a sane
 * range) and defaults to 50_000 — enough headroom for realistic traffic
 * bursts while still bounding memory.
 */
function getMemoryStoreMaxEntries(): number {
  const raw = process.env.RATE_LIMIT_MEMORY_MAX_ENTRIES;
  if (raw) {
    const n = Number.parseInt(raw, 10);
    // Clamp to [1_000, 500_000] to prevent misconfiguration
    if (Number.isFinite(n) && n >= 1_000 && n <= 500_000) return n;
  }
  return 50_000;
}

/** Resolved max entries (evaluated once per isolate cold-start). */
const MEMORY_STORE_MAX_ENTRIES = getMemoryStoreMaxEntries();

const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

/** A98-51: Evict the least-recently-used entries until we're under the cap. */
function lruEvict(excess: number): void {
  // Collect entries with their lastAccess time
  const entries: { key: string; lastAccess: number }[] = [];
  for (const [key, entry] of memoryStore) {
    entries.push({ key, lastAccess: entry.lastAccess });
  }
  // Sort by lastAccess ascending (least recently used first)
  entries.sort((a, b) => a.lastAccess - b.lastAccess);
  // Evict the least recently used entries
  for (let i = 0; i < Math.min(excess, entries.length); i++) {
    memoryStore.delete(entries[i]!.key);
  }
}

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

  // A75/A98-51: If still over cap after expiry cleanup, true-LRU eviction.
  if (memoryStore.size > MEMORY_STORE_MAX_ENTRIES) {
    const excess = memoryStore.size - MEMORY_STORE_MAX_ENTRIES;
    lruEvict(excess);
  }
}

function checkRateLimitMemory(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const cutoff = now - config.windowMs;

  cleanupMemory(config.windowMs);

  let entry = memoryStore.get(key);
  if (!entry) {
    // A75: Enforce hard cap before inserting new entries.
    if (memoryStore.size >= MEMORY_STORE_MAX_ENTRIES) {
      // A98-51: Evict the single least-recently-used entry.
      lruEvict(1);
    }
    entry = { timestamps: [], lastAccess: now };
    memoryStore.set(key, entry);
  }

  // A98-51: Update last-access time on every touch
  entry.lastAccess = now;

  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= config.maxRequests) {
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = oldestInWindow! + config.windowMs - now;
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
 * LIB-HIGH-2: Audit-trail logging for the rate-limit kill switches
 * (`RATE_LIMIT_FORCE_OPEN` / `RATE_LIMIT_FORCE_CLOSED`).
 *
 * Both flags bypass the entire distributed limiter with, previously, zero log
 * trail. FORCE_OPEN in particular disables ALL rate limiting — if an operator
 * flips it on during an incident and forgets to flip it back, every brute-force
 * / abuse control is silently gone. Emit a structured warning on every bypassed
 * request so the state is always visible in logs, and a (throttled) Sentry
 * capture so it pages in monitoring dashboards.
 *
 * `key` carries the rate-limit bucket identity (e.g. `login:<ip>`,
 * `admin:<email>`), which is the closest available proxy to "which request was
 * bypassed" without plumbing the full request URL through every caller.
 *
 * The Sentry capture is throttled once per minute per switch (mirroring the
 * `kvLastAlertedAt` pattern) to avoid burning Sentry quota under load while the
 * kill switch is intentionally on; the structured `logger.warn` fires on every
 * call so log scrapers/burn-rate metrics see continuous signal.
 */
const killSwitchLastAlertedAt: Record<string, number> = {};
const KILL_SWITCH_ALERT_INTERVAL_MS = 60_000;

function logKillSwitchBypass(flag: string, key: string, mode: "force-open" | "force-closed"): void {
  const event = mode === "force-open" ? "rate_limit_bypassed" : "rate_limit_force_closed";
  logger.warn("Rate-limit kill switch is active — every request bypasses the limiter", {
    level: "WARN",
    event,
    flag,
    rate_limit_key: key,
    ts: new Date().toISOString(),
  });

  const now = Date.now();
  if (now - (killSwitchLastAlertedAt[flag] ?? 0) >= KILL_SWITCH_ALERT_INTERVAL_MS) {
    killSwitchLastAlertedAt[flag] = now;
    try {
      captureMessage(
        `Rate-limit kill switch ${flag} is active (mode: ${mode}); rate limiting bypassed for key ${key}`,
        "warning",
      );
    } catch {
      // fail-open: best-effort [criticality:non-critical]
      // Sentry unavailable — the logger.warn above still carries the signal.
    }
  }
}

/**
 * Check and record a request against the rate limit.
 *
 * Uses Cloudflare KV in production for distributed rate limiting.
 * Falls back to in-memory store in local development, or — per F-3 —
 * in production for a bounded grace window when KV is unexpectedly
 * unavailable.
 */
let kvFallbackWarned = false;
// H-6: Replaced one-shot boolean with a timestamp so we can re-alert
// every 60s during a sustained outage instead of going silent.
let kvLastAlertedAt = 0;
const KV_ALERT_INTERVAL_MS = 60_000;
/** Epoch ms at which KV first became unavailable in this isolate; null when KV is healthy. */
let kvUnavailableSince: number | null = null;
/** Count of recent outages used to shrink grace windows during rapid KV flapping. */
let kvRecentOutageCount = 0;
/** Epoch ms when KV last recovered successfully. */
let kvLastRecoveredAt: number | null = null;

/**
 * Grace window during which the limiter falls back to per-isolate memory
 * when KV is unavailable. After the window elapses without recovery the
 * limiter fails closed. Overridable via RATE_LIMIT_KV_GRACE_MS for ops drills.
 */
const DEFAULT_KV_GRACE_MS = 60_000;
const KV_OUTAGE_BACKOFF_RESET_MS = DEFAULT_KV_GRACE_MS * 5;

function getKvGraceMs(): number {
  const raw = process.env.RATE_LIMIT_KV_GRACE_MS;
  if (!raw) return DEFAULT_KV_GRACE_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_KV_GRACE_MS;
}

/** Reset internal KV-availability state. Exported for tests. */
export function __resetRateLimitKvStateForTests(): void {
  kvFallbackWarned = false;
  kvLastAlertedAt = 0;
  kvUnavailableSince = null;
  kvRecentOutageCount = 0;
  kvLastRecoveredAt = null;
  for (const k of Object.keys(killSwitchLastAlertedAt)) delete killSwitchLastAlertedAt[k];
}

function markKvAvailable(): void {
  kvLastAlertedAt = 0;
  kvUnavailableSince = null;
  kvLastRecoveredAt = Date.now();
}

function getEffectiveGraceMs(config: RateLimitConfig): number {
  const baseGraceMs = config.graceMs ?? getKvGraceMs();
  const divisor = 2 ** Math.max(kvRecentOutageCount - 1, 0);
  return Math.max(Math.floor(baseGraceMs / divisor), 1_000);
}

/**
 * KV is unavailable (binding missing or get/put threw).
 *
 * Per-route policy (via `config.failPolicy`):
 * - "closed": immediately reject.
 * - "open": skip rate limiting, allow the request.
 * - "grace" (default): fall back to in-memory for KV_GRACE_MS in production,
 *   then fail closed. In development, fallback indefinitely.
 */
function handleKvUnavailable(
  key: string,
  config: RateLimitConfig,
  reason: string,
  err?: unknown,
): RateLimitResult {
  const policy = config.failPolicy ?? "grace";
  const isProduction =
    process.env.NODE_ENV === "production" ||
    (typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers");

  const now = Date.now();
  const shouldAlert = now - kvLastAlertedAt >= KV_ALERT_INTERVAL_MS;

  if (policy === "closed") {
    if (shouldAlert) {
      kvLastAlertedAt = now;
      const msg = `[rate-limit] KV unavailable (${reason}) — failing CLOSED per route policy.`;
      logger.error(msg, { metric: "rate_limit_kv_failclosed", reason, policy });
      captureException(err ?? new Error(msg), {
        context: "rate-limit.kv-unavailable-fail-closed",
        extra: { reason, policy },
      });
    }
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.min(getKvGraceMs(), config.windowMs),
    };
  }

  if (policy === "open") {
    if (shouldAlert) {
      kvLastAlertedAt = now;
      const msg = `[rate-limit] KV unavailable (${reason}) — failing OPEN per route policy.`;
      logger.warn(msg, { metric: "rate_limit_kv_failopen", reason, policy });
      captureException(err ?? new Error(msg), {
        context: "rate-limit.kv-unavailable-fail-open",
        extra: { reason, policy },
        level: "warning",
      });
    }
    return { allowed: true, remaining: config.maxRequests, retryAfterMs: 0 };
  }

  // policy === "grace" (default)
  if (!isProduction && !kvFallbackWarned) {
    kvFallbackWarned = true;
    logger.warn(
      "[rate-limit] KV namespace RATE_LIMIT_KV not available — using in-memory fallback",
      {
        hint: "This is expected in local dev but NOT safe for production.",
      },
    );
  }

  if (kvUnavailableSince === null) {
    if (kvLastRecoveredAt === null || now - kvLastRecoveredAt >= KV_OUTAGE_BACKOFF_RESET_MS) {
      kvRecentOutageCount = 1;
    } else {
      kvRecentOutageCount += 1;
    }
    kvUnavailableSince = now;
  }

  const graceMs = getEffectiveGraceMs(config);

  if (isProduction && shouldAlert) {
    kvLastAlertedAt = now;
    const msg =
      `[rate-limit] WARNING: KV unavailable (${reason}). ` +
      `Falling back to per-isolate memory for up to ${graceMs}ms; ` +
      "after the grace window elapses requests will fail CLOSED. " +
      "Configure the KV binding in wrangler.jsonc to restore distributed rate limiting.";
    logger.error(msg, {
      metric: "rate_limit_kv_failopen",
      reason,
      grace_ms: graceMs,
      recent_outage_count: String(kvRecentOutageCount),
    });
    captureException(err ?? new Error(msg), {
      context: "rate-limit.kv-unavailable-fail-open",
      extra: { reason, graceMs, recentOutageCount: kvRecentOutageCount },
    });
  }

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
  // FIX-07 (F-015): Kill-switch for incident response. When set, every
  // rate-limited request is immediately rejected without consulting
  // KV/DO. Use during active abuse to shed load instantly.
  if (process.env.RATE_LIMIT_FORCE_CLOSED === "true") {
    logKillSwitchBypass("RATE_LIMIT_FORCE_CLOSED", key, "force-closed");
    return { allowed: false, remaining: 0, retryAfterMs: config.windowMs };
  }

  // OPS: emergency force-open kill switch. When set, every rate-limited
  // request is allowed through. Use when the underlying limiter (DO/KV) is
  // misconfigured and fail-closed is locking out legitimate users.
  // Higher-level controls (Cloudflare WAF, Turnstile) should be relied on
  // while this is enabled.
  if (process.env.RATE_LIMIT_FORCE_OPEN === "true") {
    // LIB-HIGH-2: FORCE_OPEN disables ALL rate limiting with zero audit trail.
    // Emit a structured warning on every bypassed request so the bypass is
    // operationally visible — this is a high-risk kill switch that must never
    // be silently left on. The Sentry capture is throttled to once per minute
    // per switch to avoid burning quota under load; the structured logger
    // warning fires every time.
    logKillSwitchBypass("RATE_LIMIT_FORCE_OPEN", key, "force-open");
    return { allowed: true, remaining: config.maxRequests, retryAfterMs: 0 };
  }

  // F-18/F-19: In production, fail closed immediately for security-critical
  // routes when neither DO nor KV bindings are available. The in-memory
  // fallback is per-isolate and trivially bypassable across isolates.
  const isProduction =
    process.env.NODE_ENV === "production" ||
    (typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers");

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

  // AM-07: If both DO and KV are missing in production and the route
  // requires "closed" policy, reject immediately rather than falling
  // back to per-isolate memory which is trivially bypassable.
  if (isProduction && config.failPolicy === "closed" && !doNs && !kv) {
    const now = Date.now();
    if (now - kvLastAlertedAt >= KV_ALERT_INTERVAL_MS) {
      kvLastAlertedAt = now;
      const msg =
        "[rate-limit] RATE_LIMITER_DO and RATE_LIMIT_KV both missing in production for closed-policy route.";
      logger.error(msg);
      captureException(new Error(msg), { context: "rate-limit.bindings-missing-closed-policy" });
    }
    return { allowed: false, remaining: 0, retryAfterMs: config.windowMs };
  }

  return handleKvUnavailable(key, config, "binding-missing");
}
