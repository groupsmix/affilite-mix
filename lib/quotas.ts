/**
 * Per-tenant quota / cost primitives (audit finding G-42).
 *
 * The platform previously enforced only **global** ceilings (rate limits,
 * AI request caps, R2 max-object-size). This module adds the missing
 * *per-tenant* layer: each site can be assigned its own ceilings for
 * AI tokens, AI cost, AI request volume, R2 storage, and R2 egress.
 *
 * Storage backend: the `RATE_LIMIT_KV` Cloudflare KV namespace already
 * bound to the worker. Counters are bucketed by window
 * (`month:YYYY-MM`, `day:YYYY-MM-DD`, or the literal `cumulative`) and
 * keyed by `quota:{siteId}:{resource}:{window}` so existing operational
 * tools (KV listing, dashboard) work unchanged.
 *
 * Failure mode (R-06): the helpers use a **circuit-breaker** strategy.
 * Transient KV failures (< 3 within 10 s) fail **open** (return
 * `allowed: true`) — quota overruns are an accounting concern, not a
 * security boundary. However, **sustained** KV failures (≥ 3 within
 * 10 s) cause `checkQuota` to fail **closed** (`allowed: false`) to
 * prevent unbounded cost exposure during a prolonged outage. Rate limits
 * (in `lib/rate-limit.ts`) remain the security-grade ceiling.
 *
 * In summary: brief blips → fail open; prolonged outage → fail closed.
 *
 * Public API:
 *   resolveTenantQuotas(siteId)       → TenantQuotaConfig
 *   checkQuota(siteId, resource, n?)  → QuotaCheckResult
 *   recordUsage(siteId, resource, n)  → void
 *   getUsageSnapshot(siteId)          → QuotaUsageSnapshot
 *
 * Wiring:
 *   - `lib/ai/providers.ts` calls `checkQuota(..., "ai_requests")` and
 *     `checkQuota(..., "ai_tokens", estimatedTokens)` before each call,
 *     then `recordUsage(...)` afterwards with the actual token totals.
 *   - `lib/r2.ts` calls `checkQuota(..., "r2_storage_bytes", contentLength)`
 *     before issuing a presigned PUT.
 */

import { captureException, captureMessage } from "@/lib/sentry";
import { getKVNamespace } from "@/lib/rate-limit";
import { allSites } from "@/config/sites";
import type { TenantQuotaOverrides } from "@/config/site-definition";

// ── Resource taxonomy ───────────────────────────────────────────────

/**
 * Resources whose usage is tracked per-tenant.
 *
 * The literal name is intentionally stable — it is used as the KV key
 * fragment and surfaced verbatim in `QuotaExceededError.resource` so
 * downstream alerting (`docs/alerting-runbook.md`) can dispatch on it.
 */
export type QuotaResource =
  | "ai_tokens"
  | "ai_cost_micro_usd"
  | "ai_requests"
  | "r2_storage_bytes"
  | "r2_egress_bytes";

interface ResourceMeta {
  /** Calendar window the counter rolls over on. */
  window: "month" | "day" | "cumulative";
  /** Site-definition override field (if any). */
  override: keyof TenantQuotaOverrides | null;
  /** Env var supplying the global default ceiling. */
  envDefault: string;
}

const RESOURCE_META: Record<QuotaResource, ResourceMeta> = {
  ai_tokens: {
    window: "month",
    override: "aiTokensPerMonth",
    envDefault: "QUOTA_DEFAULT_AI_TOKENS_PER_MONTH",
  },
  ai_cost_micro_usd: {
    window: "month",
    override: "aiCostMicroUsdPerMonth",
    envDefault: "QUOTA_DEFAULT_AI_COST_MICRO_USD_PER_MONTH",
  },
  ai_requests: {
    window: "day",
    override: "aiRequestsPerDay",
    envDefault: "QUOTA_DEFAULT_AI_REQUESTS_PER_DAY",
  },
  r2_storage_bytes: {
    window: "cumulative",
    override: "r2StorageBytes",
    envDefault: "QUOTA_DEFAULT_R2_STORAGE_BYTES",
  },
  r2_egress_bytes: {
    window: "month",
    override: "r2EgressBytesPerMonth",
    envDefault: "QUOTA_DEFAULT_R2_EGRESS_BYTES_PER_MONTH",
  },
};

// ── Public types ────────────────────────────────────────────────────

/**
 * Resolved per-tenant ceilings. `undefined` means "no ceiling" — the
 * resource is unlimited for this tenant.
 */
export type TenantQuotaConfig = {
  [R in QuotaResource]?: number;
};

export interface QuotaCheckResult {
  allowed: boolean;
  /** Resource being checked. */
  resource: QuotaResource;
  /** Configured limit, or `undefined` when unlimited. */
  limit: number | undefined;
  /** Usage counted *before* this check (for the active window). */
  usage: number;
  /** Increment requested (1 by default). */
  increment: number;
  /** Remaining capacity assuming the increment is applied. */
  remaining: number;
  /** Window the counter rolls over on. */
  window: "month" | "day" | "cumulative";
  /** Window key used for this check (e.g. `2025-04`). */
  windowKey: string;
}

export interface QuotaUsageSnapshot {
  siteId: string;
  /** Current window key per resource (helps when reading across rollovers). */
  asOf: { [R in QuotaResource]: string };
  usage: { [R in QuotaResource]: number };
  limits: TenantQuotaConfig;
}

export class QuotaExceededError extends Error {
  readonly resource: QuotaResource;
  readonly siteId: string;
  readonly limit: number;
  readonly usage: number;
  readonly window: "month" | "day" | "cumulative";
  constructor(siteId: string, result: QuotaCheckResult) {
    super(
      `Quota exceeded for site ${siteId}: ${result.resource} usage=${result.usage} limit=${result.limit ?? "∞"}`,
    );
    this.name = "QuotaExceededError";
    this.resource = result.resource;
    this.siteId = siteId;
    this.limit = result.limit ?? Number.POSITIVE_INFINITY;
    this.usage = result.usage;
    this.window = result.window;
  }
}

// ── Window helpers ──────────────────────────────────────────────────

function windowKey(window: ResourceMeta["window"], now: Date = new Date()): string {
  switch (window) {
    case "month": {
      const y = now.getUTCFullYear();
      const m = String(now.getUTCMonth() + 1).padStart(2, "0");
      return `${y}-${m}`;
    }
    case "day": {
      const y = now.getUTCFullYear();
      const m = String(now.getUTCMonth() + 1).padStart(2, "0");
      const d = String(now.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    case "cumulative":
      return "cumulative";
  }
}

/** TTL (seconds) for KV entries — generous to outlive clock skew. */
function windowTtlSeconds(window: ResourceMeta["window"]): number | undefined {
  switch (window) {
    case "month":
      return 60 * 60 * 24 * 35; // ~35 days
    case "day":
      return 60 * 60 * 36; // 36h
    case "cumulative":
      return undefined; // never expire
  }
}

function kvKey(siteId: string, resource: QuotaResource, window: string): string {
  return `quota:${siteId}:${resource}:${window}`;
}

// ── Config resolution ───────────────────────────────────────────────

function readEnvNumber(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

function findSiteOverrides(siteId: string): TenantQuotaOverrides | undefined {
  // `allSites` is a static record from config/sites/. DB-only sites won't
  // appear here — they'll just inherit the global defaults, which matches
  // the behaviour the rest of the platform takes for those sites.
  const def = allSites.find((s) => s.id === siteId);
  return def?.quotas;
}

/**
 * Resolve the effective ceilings for a tenant. Site-level overrides
 * take precedence over global env defaults; either resolving to
 * `undefined` means the resource is unlimited for that tenant.
 */
export function resolveTenantQuotas(siteId: string): TenantQuotaConfig {
  const overrides = findSiteOverrides(siteId);
  const out: TenantQuotaConfig = {};
  for (const resource of Object.keys(RESOURCE_META) as QuotaResource[]) {
    const meta = RESOURCE_META[resource];
    const fromSite = meta.override ? overrides?.[meta.override] : undefined;
    const fromEnv = readEnvNumber(meta.envDefault);
    const limit = fromSite ?? fromEnv;
    if (typeof limit === "number") out[resource] = limit;
  }
  return out;
}

// ── Counter access ──────────────────────────────────────────────────

interface CounterShape {
  count: number;
}

// F-API-07: Track recent KV failures within a sliding time window so that we
// fail closed only on a sustained KV outage. Using a simple counter shared
// across all tenants in the isolate would let three failures from unrelated
// sites trip the threshold for everyone, and a single success from any tenant
// would reset it. A timestamp window scopes "sustained" to wall-clock time
// rather than request count, so interleaved traffic from many tenants can't
// flip the breaker spuriously.
const KV_FAILURE_THRESHOLD = 3;
const KV_FAILURE_WINDOW_MS = 10_000;
const kvFailureTimestamps: number[] = [];

function recordKvFailure(now: number): number {
  const cutoff = now - KV_FAILURE_WINDOW_MS;
  while (kvFailureTimestamps.length > 0 && kvFailureTimestamps[0] < cutoff) {
    kvFailureTimestamps.shift();
  }
  kvFailureTimestamps.push(now);
  return kvFailureTimestamps.length;
}

function resetKvFailures(): void {
  kvFailureTimestamps.length = 0;
}

async function readCounter(
  siteId: string,
  resource: QuotaResource,
  window: string,
): Promise<number> {
  const kv = getKVNamespace();
  if (!kv) {
    // RC-NOW-04 / R2-03: In production, missing KV namespace must fail closed
    // for AI generation resources to prevent unbounded cost exposure.
    const isProduction = process.env.NODE_ENV === "production";
    const aiResources: QuotaResource[] = ["ai_tokens", "ai_cost_micro_usd", "ai_requests"];
    if (isProduction && aiResources.includes(resource)) {
      throw new Error(
        `Quota KV namespace not bound — failing closed for ${resource} in production.`,
      );
    }
    return 0;
  }
  try {
    const key = kvKey(siteId, resource, window);
    const data = (await kv.get(key, "json")) as CounterShape | null;
    resetKvFailures();
    return data?.count ?? 0;
  } catch (err) {
    const recentFailures = recordKvFailure(Date.now());
    captureException(err, {
      context: "quotas.readCounter",
      extra: {
        siteId,
        resource,
        window,
        recentFailures,
        windowMs: KV_FAILURE_WINDOW_MS,
      },
    });
    if (recentFailures >= KV_FAILURE_THRESHOLD) {
      throw new Error(
        `KV unreachable for ${recentFailures} calls within ${KV_FAILURE_WINDOW_MS}ms — failing closed.`,
      );
    }
    return 0;
  }
}

async function writeCounter(
  siteId: string,
  resource: QuotaResource,
  window: string,
  count: number,
): Promise<void> {
  const kv = getKVNamespace();
  if (!kv) {
    // RC-NOW-04: Log missing KV for write operations; read path handles fail-closed.
    captureMessage(
      `quotas.writeCounter: KV namespace not bound (siteId=${siteId} resource=${resource})`,
      "warning",
    );
    return;
  }
  try {
    const key = kvKey(siteId, resource, window);
    const ttl = windowTtlSeconds(RESOURCE_META[resource].window);
    await kv.put(key, JSON.stringify({ count }), ttl ? { expirationTtl: ttl } : undefined);
  } catch (err) {
    captureException(err, {
      context: "quotas.writeCounter",
      extra: { siteId, resource, window, count },
    });
  }
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Inspect whether a tenant has capacity for `increment` more units of
 * `resource` in the active window. Does NOT mutate the counter — call
 * `recordUsage()` after the side-effecting work succeeds so failed
 * upstream calls don't burn quota.
 */
export async function checkQuota(
  siteId: string,
  resource: QuotaResource,
  increment: number = 1,
): Promise<QuotaCheckResult> {
  if (!siteId) {
    throw new Error("checkQuota requires a non-empty siteId");
  }
  if (!Number.isFinite(increment) || increment < 0) {
    throw new Error(`checkQuota increment must be a non-negative number (got ${increment})`);
  }
  const meta = RESOURCE_META[resource];
  const limit = resolveTenantQuotas(siteId)[resource];
  const wKey = windowKey(meta.window);
  try {
    const usage = await readCounter(siteId, resource, wKey);
    const projected = usage + increment;
    const allowed = limit === undefined || projected <= limit;
    return {
      allowed,
      resource,
      limit,
      usage,
      increment,
      remaining: limit === undefined ? Number.POSITIVE_INFINITY : Math.max(0, limit - projected),
      window: meta.window,
      windowKey: wKey,
    };
  } catch (err) {
    // F-API-07: Fail closed when KV is persistently unreachable
    return {
      allowed: false,
      resource,
      limit,
      usage: Number.POSITIVE_INFINITY,
      increment,
      remaining: 0,
      window: meta.window,
      windowKey: wKey,
    };
  }
}

/**
 * Record `amount` units of usage against `resource` for `siteId`. Best-effort:
 * failures are logged but never thrown, so callers can fire-and-forget after
 * the underlying side-effect (AI call / R2 upload) has already happened.
 *
 * `amount` may be negative to credit usage back to the counter — used by
 * the upload-finalize / media-delete reconciliation flow described in
 * `docs/per-tenant-quotas.md`. Crediting clamps the resulting counter at
 * zero so a stray over-credit can't push usage below zero (which would
 * effectively grant the tenant extra capacity beyond their ceiling).
 * Non-finite or zero amounts are no-ops.
 */
export async function recordUsage(
  siteId: string,
  resource: QuotaResource,
  amount: number,
): Promise<void> {
  if (!siteId) return;
  if (amount === 0) return;
  if (!Number.isFinite(amount)) {
    // NaN / Infinity here is always a caller bug — surface it loudly
    // (without throwing, since callers fire-and-forget) so it shows up
    // in alerting instead of being silently dropped.
    captureMessage(
      `quotas.recordUsage received non-finite amount: ${amount} (siteId=${siteId} resource=${resource})`,
      "warning",
    );
    return;
  }
  const meta = RESOURCE_META[resource];
  const wKey = windowKey(meta.window);
  const current = await readCounter(siteId, resource, wKey);
  const raw = current + amount;
  const next = Math.max(0, raw);
  if (raw < 0) {
    // Over-credit (e.g. a duplicate finalize signal credited bytes
    // that had already been credited). Counter is clamped at zero —
    // log so operators can spot the runaway upstream.
    captureMessage(
      `quotas.recordUsage over-credit clamped to zero: siteId=${siteId} resource=${resource} current=${current} amount=${amount}`,
      "warning",
    );
  }
  await writeCounter(siteId, resource, wKey, next);
}

/**
 * Convenience helper: check the quota and throw `QuotaExceededError` when
 * over the limit. Use this from request handlers / library code that want
 * a simple guard.
 */
export async function assertQuota(
  siteId: string,
  resource: QuotaResource,
  increment: number = 1,
): Promise<QuotaCheckResult> {
  const result = await checkQuota(siteId, resource, increment);
  if (!result.allowed) throw new QuotaExceededError(siteId, result);
  return result;
}

/**
 * Read all usage counters for a site. Useful for admin dashboards and
 * the cost-attribution report tracked in `docs/ai-governance.md`.
 */
export async function getUsageSnapshot(siteId: string): Promise<QuotaUsageSnapshot> {
  const limits = resolveTenantQuotas(siteId);
  const usage = {} as { [R in QuotaResource]: number };
  const asOf = {} as { [R in QuotaResource]: string };
  for (const resource of Object.keys(RESOURCE_META) as QuotaResource[]) {
    const meta = RESOURCE_META[resource];
    const wKey = windowKey(meta.window);
    asOf[resource] = wKey;
    usage[resource] = await readCounter(siteId, resource, wKey);
  }
  return { siteId, asOf, usage, limits };
}

// ── Token / cost estimation helpers ─────────────────────────────────

/**
 * Rough token estimator for arbitrary text. Real tokenisation depends
 * on the provider; this is a deterministic upper-bound used only for
 * pre-flight quota checks — actual token counts (when reported by the
 * provider) should be fed into `recordUsage` to keep the counter in
 * sync with reality.
 *
 * Heuristic: ~4 chars per token (OpenAI's published estimate).
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Convert a USD cost into the integer micro-USD unit used by the
 * `ai_cost_micro_usd` counter. KV counters are integers, so we scale
 * cost by 1e6 to preserve enough precision for sub-cent ceilings.
 */
export function costToMicroUsd(usd: number): number {
  if (!Number.isFinite(usd) || usd < 0) return 0;
  return Math.round(usd * 1_000_000);
}
