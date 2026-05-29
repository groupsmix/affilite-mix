# Season 10 — Architecture Re-Audit

**Date:** 2026-05-29
**Auditor:** Devin (automated architecture review)
**Scope:** Full codebase review of `groupsmix/affilite-mix` (main branch)
**Method:** Static code analysis against each open issue claim, plus discovery scan for new findings

---

## Executive Summary

Nine open architecture issues (#597, #598, #605, #606, #607, #609, #610, #611, #613) were verified against the actual codebase. **Six are confirmed real, two are partially mitigated but retain residual risk, and one is a false positive.** Four new architecture-level findings are documented below.

| Verdict                                   | Count |
| ----------------------------------------- | ----- |
| **CONFIRMED**                             | 6     |
| **PARTIAL** (mitigated but residual risk) | 2     |
| **FALSE POSITIVE**                        | 1     |
| **NEW findings**                          | 4     |

---

## 1. Existing Issue Verification

### #598 — Middleware is 722 lines (complexity / maintainability)

**Verdict: CONFIRMED — Real, Low-Severity Maintainability Concern**

`middleware.ts` is exactly 722 lines. The file handles:

- Recursion depth guard (lines 90–101)
- Hostname canonicalization + sanitization (lines 73–114)
- Maintenance mode with KV cache (lines 121–166)
- Body size guard (line 169)
- GPC signal (lines 172–177)
- CORS preflight with KV-backed custom domain lookup (lines 193–246)
- Static + dynamic site resolution with negative caching and rate limiting (lines 248–485)
- Trailing-slash normalization (lines 491–503)
- CSRF validation (lines 505–534)
- Header injection (site-id, trace-id, HMAC signature) (lines 536–568)
- CSP nonce generation (lines 552–568)
- Security headers (line 574)
- W3C Trace Context (lines 583–585)
- CORS response headers (lines 587–602)
- Timeout wrapper with AbortController (lines 612–722)

**Assessment:** While 722 lines is large for a single middleware file, the code is well-structured with clear comment blocks delineating each concern. Several pieces have already been extracted (`middleware-helpers.ts`, `middleware-site-lookup.ts`, `unknown-host-guard.ts`, `csp.ts`). The remaining logic is inherently sequential (each step depends on the previous), making further decomposition non-trivial without introducing indirection overhead in the hot path. This is a **valid maintainability concern** but not an urgent architecture risk — the file is readable and each section is documented.

**Severity: Low (maintainability, not correctness)**

---

### #597 — Thundering Herd on Cache Expiry

**Verdict: FALSE POSITIVE — Already Mitigated**

The issue claims concurrent requests on cache expiry cause a thundering herd stampede to the database.

**Evidence of mitigation:**

- `lib/single-flight.ts` implements a classic single-flight/request-coalescing pattern. `getMiddlewareSiteRowByDomain()` (`lib/middleware-site-lookup.ts:37`) wraps every DB lookup in `singleFlight(`site-lookup:${domain}`, ...)`.
- When a cached site row expires and N concurrent requests hit the same domain, only the first triggers the DB lookup — all others coalesce on the same Promise.
- The KV cache has a 60-second TTL (`middleware.ts:421`), and the negative cache uses an exponential TTL ramp (300s → 3600s) via `getNegativeCacheTtlSeconds()`.
- The site lookup also has a 1.5-second hard timeout (`SITE_LOOKUP_TIMEOUT_MS`).

**Assessment:** The thundering herd scenario is comprehensively addressed per-isolate. Cross-isolate stampede (multiple CF Workers isolates independently expiring their caches) is inherent to the serverless model and cannot be fully eliminated without shared state (e.g., Durable Objects), but the single-flight pattern within each isolate is the standard mitigation.

**Severity: N/A — False Positive**

---

### #607 — Cache Cross-Tenant Leak

**Verdict: CONFIRMED — Real, Medium Severity**

The issue claims KV cache entries could leak data across tenants.

**Evidence:**

- The middleware caches site resolution rows at `site-domain:${hostname}` (`middleware.ts:352, 421`). The cache key includes the hostname, which is correct — each tenant domain maps to exactly one site row.
- The product URL cache in `app/api/track/click/route.ts:169` uses `product-url:${siteId}:${productSlug}` — site-scoped, correct.
- **However**, the `maintenance_mode` KV key (`middleware.ts:144`) is a **global singleton** — there is no per-tenant maintenance mode. This is documented behavior (the flag is platform-wide), not a cross-tenant leak.
- **The real cross-tenant risk** is in the CORS preflight KV lookup (`middleware.ts:214`): when a custom-domain preflight reads a cached site row, the cache entry was written by the main middleware flow and contains `slug` + `is_active`. If a site's `is_active` flag changes, the stale 60-second cache serves the old state. While this is a consistency window (not a data leak), a deactivated site could process requests for up to 60 seconds after deactivation.
- More critically, the `site-domain:${hostname}` cache key in the middleware (`line 421`) stores the full site row JSON with a 60-second TTL, but there is **no cache invalidation on site domain change**. If Site A's domain is reassigned to Site B, the stale cache entry maps the domain to Site A for up to 60 seconds. `lib/dal/sites.ts:123-146` does implement explicit KV deletion on domain updates, but this only runs server-side — the per-isolate KV cache in middleware may still hold the stale entry if the delete races with a concurrent read.

**Severity: Medium (stale-data window on domain reassignment, not direct data exfiltration)**

---

### #606 — Circuit Breaker on CF Workers (Per-Isolate, Not Fleet-Wide)

**Verdict: CONFIRMED — Real, Low Severity (Acknowledged in Code)**

The issue claims the circuit breaker (`lib/ai/circuit-breaker.ts`) is ineffective on Cloudflare Workers because state is per-isolate.

**Evidence:**

- The `registry` Map (line 130) is module-level, meaning it lives only for the lifetime of a single Worker isolate.
- The code itself documents this limitation extensively in the `S5-07` comment block (lines 14–23): "the breaker state is NOT shared across isolates… the breaker rarely reaches a useful fleet-wide OPEN state."
- The mitigation is also documented: "the per-provider fallback chain already provides availability."

**Assessment:** This is a **known, accepted limitation** explicitly documented in the code. The circuit breaker still provides value within a single isolate (prevents repeated calls to a failing provider during a single request burst). The recommended fix (backing the registry with KV or Durable Objects) is noted as low-priority. The issue is real but the severity is low because the provider fallback chain is the primary availability mechanism.

**Severity: Low (documented, mitigated by fallback chain)**

---

### #605 — Dashboard Unbounded Queries

**Verdict: PARTIAL — Mostly Mitigated, Residual Risk in Fallback Path**

The issue claims dashboard queries lack pagination and could scan entire tables.

**Evidence of mitigation:**

- `lib/dal/pagination-guard.ts` implements `clampPagination()` with `MAX_LIMIT = 200` and `MAX_OFFSET = 100_000`.
- All major DAL list functions (`listContent`, `listProducts`, `listAuditLogs`) use `clampPagination()`.
- `getDashboardStats()` (`lib/dal/dashboard-stats.ts`) uses an RPC call as the primary path, which is bounded server-side.

**Residual risk:**

- The **fallback path** in `fallbackDashboardStats()` (lines 61–173) fetches up to `CONTENT_CAP = 5000` content IDs into memory (line 127–132), then batches `.in()` queries at 500-per-batch. While capped, this is still a significant amount of data for what should be a simple count.
- `listAdminUsers()` (`lib/dal/admin-users.ts:76-89`) has **no pagination at all** — it fetches all admin users with `.unsafeNoSiteFilter().order(...)` and no `.limit()`. For a small number of admins this is fine, but the absence of a guard is a pattern violation.
- `getNicheHealthStats()` (`lib/dal/niche-health.ts`) uses an RPC with no limit — the result size scales with the number of active sites. At 100+ sites this could return a significant payload.
- `listDistinctMerchants()` in `lib/dal/products.ts` has no limit guard on the SELECT query.

**Severity: Low-Medium (most paths are guarded; residual risk in admin/internal paths)**

---

### #609 — Click Queue No Backpressure

**Verdict: CONFIRMED — Real, Medium Severity**

The issue claims the click queue producer has no backpressure mechanism.

**Evidence:**

- `publishClick()` in `lib/click-queue.ts` calls `queue.send(payload)` (line 88) without any rate limiting, queue depth check, or backpressure signal.
- The Cloudflare Queue `.send()` API is fire-and-forget — it does not expose queue depth or consumer lag. If the consumer falls behind, the queue silently grows until Cloudflare's internal limits are hit.
- When `queue.send()` fails, the code falls back to `logClickFailure()` (line 98) in production, which inserts into `click_failures`. This is a reasonable degradation, but there is **no feedback loop** to slow down the producer.
- The consumer side (`workers/custom-worker.ts:160-353`) has proper per-message ack/retry, a batch size cap (MAX_MESSAGES_PER_BATCH = 200), and DLQ handling. The consumer side is well-designed.
- The **gap** is on the producer side: under a traffic spike, `publishClick()` will attempt to enqueue every click without throttling. The rate limit on the click API route (`CLICK_RATE_LIMIT: 60/min/IP`) provides IP-level throttling but not queue-level backpressure.

**Severity: Medium (producer-side, no queue depth visibility on CF Workers)**

---

### #610 — AbortSignal Dropped

**Verdict: PARTIAL — Mitigated in Middleware, Missing in Sub-Functions**

The issue claims the AbortSignal from the middleware timeout is not propagated to downstream async calls.

**Evidence of mitigation:**

- The middleware timeout wrapper (`middleware.ts:622-652`) creates an `AbortController` and passes `signal` to `innerMiddleware()`.
- `innerMiddleware()` calls `throwIfAborted(signal)` at multiple checkpoints (lines 140, 145, 260, 303, 358, 415, 417).
- `fetchWithTimeout()` (`lib/fetch-timeout.ts:46-47`) composes AbortSignals via `AbortSignal.any()`.

**Residual risk:**

- The `signal` parameter is **not forwarded** to `getMiddlewareSiteRowByDomain()` (`lib/middleware-site-lookup.ts`). The site lookup calls `fetchWithTimeout()` with its own 1.5-second timeout but does not accept an external AbortSignal. If the middleware's 5-second timeout fires during the fetch, the `throwIfAborted()` check on line 417 catches it, but the underlying HTTP request continues running until the 1.5-second fetch timeout expires — wasting isolate CPU time.
- Similarly, the `checkRateLimit()` call on line 305 does not receive the abort signal. If rate limiting uses Durable Objects (`lib/rate-limit.ts:122`), the DO `fetch()` call runs independently of the middleware timeout.
- The KV `.get()` and `.put()` calls in the middleware body are not signal-aware. KV operations are typically fast (<5ms), so this is low-risk.

**Severity: Low (the checkpoint pattern catches most cases; the wasted CPU from non-cancelled sub-operations is bounded by their individual timeouts)**

---

### #611 — `unsafeNoSiteFilter` Overuse

**Verdict: CONFIRMED — Real, Medium Severity**

The issue claims `unsafeNoSiteFilter()` is used excessively, weakening the tenant isolation guard.

**Evidence:**

- Grep finds **86 occurrences** across the codebase.
- Many usages are **legitimate**: `admin_users` table has no `site_id` column (global accounts), `click_failures` is a cross-tenant DLQ, `stripe_events` / `webhook_dlq` are global event tables, cron jobs operate across all sites.
- **Concerning patterns:**
  - `lib/dal/admin-users.ts` uses `unsafeNoSiteFilter()` on every query (12 occurrences) because the table is inherently cross-tenant. This is correct but means the tenant isolation proxy provides zero value for this table — the opt-out is 100%.
  - `lib/dal/sites.ts` uses it on 5 queries, which is correct (sites are the tenant-defining table).
  - `app/api/cron/data-retention/route.ts` has **9 occurrences** — the most in any single file. This is a background job that purges old data across all tenants, so cross-tenant access is necessary, but the concentration of opt-outs in one file increases the blast radius of a bug.
  - `app/api/cron/publish/route.ts` has 5 occurrences for cross-site content publishing.
  - `lib/dal/deals.ts:164` uses it for a cross-site deals aggregation (documented at line 151).

**Assessment:** The `unsafeNoSiteFilter()` pattern is a well-designed guardrail, but its high opt-out rate (86 uses) means the guardrail's effective coverage is lower than it appears. The risk is not that current uses are wrong — most are justified — but that future developers will cargo-cult the opt-out without understanding the implications. A code review lint rule or CODEOWNER requirement for PRs touching `unsafeNoSiteFilter` would reduce this risk.

**Severity: Medium (process risk, not current bug)**

---

### #613 — Click Dedup (False Positive / Implementation Gap)

**Verdict: CONFIRMED — Real, Low Severity**

The issue claims click deduplication has gaps.

**Evidence:**

- `app/api/track/click/route.ts:61-78` implements `isDuplicateClick()` using KV with a 24-hour TTL. The fingerprint is an HMAC of `siteId + contentSlug + ipPrefix + uaHash` (line 38).
- **Gap 1:** Dedup only runs when `hmacKey` is set AND the click is not internal (line 327). If `CLICK_CACHE_HMAC_KEY` is missing, dedup is entirely skipped. The code logs an error in production (line 130) but still proceeds to record the click.
- **Gap 2:** The dedup key is `click-dedup:${siteId}:${contentSlug}:${fingerprint}`. If the same user clicks the same product from different content pages, the clicks are NOT deduped (different `contentSlug`). This may be intentional (per-campaign attribution) but reduces dedup effectiveness.
- **Gap 3:** KV dedup is best-effort — if `getAppCacheKV()` returns null (outside Workers), dedup silently returns "unique" (line 68). In local development, every click is recorded regardless.
- **Gap 4:** The `isDuplicateClick()` function performs a read-then-write (`kv.get` then `kv.put`) which has a TOCTOU race. Two near-simultaneous clicks with the same fingerprint could both read "unique", both write the dedup key, and both be recorded. This is inherent to KV (no atomic check-and-set).

**Severity: Low (analytics accuracy, not security or revenue — the stated behavior is documented as best-effort)**

---

## 2. New Architecture Findings

### NEW-01 — `previewAllowlist` Parsed on Every Request

**File:** `middleware.ts:271-274`
**Severity: Low (performance)**

```typescript
const previewAllowlistRaw = process.env.PREVIEW_HOST_ALLOWLIST ?? "";
const previewAllowlist = previewAllowlistRaw
  ? new Set(previewAllowlistRaw.split(",").map((h) => h.trim().toLowerCase()))
  : null;
```

A new `Set` is allocated, and the comma-delimited env var is split, trimmed, and lowercased on **every request**. For the hot middleware path on Cloudflare Workers, this should be hoisted to module scope (like `CORS_ALLOWED_METHODS` on line 44) since `process.env.PREVIEW_HOST_ALLOWLIST` does not change within an isolate's lifetime.

---

### NEW-02 — `runAfterResponse` Resolves `getCloudflareContext` Asynchronously

**File:** `lib/wait-until.ts:73-85`
**Severity: Medium (reliability)**

```typescript
void (async () => {
  const ctx = await getExecutionContext();
  if (ctx) {
    try {
      ctx.waitUntil(wrapped);
    } catch {
      /* ... */
    }
  }
})();
```

The `runAfterResponse()` function fires an async IIFE to resolve the execution context and call `ctx.waitUntil()`. If the HTTP response is sent before this IIFE runs (which is likely — it's unawaited), the execution context may already be closing. On Cloudflare Workers, `waitUntil()` must be called synchronously within the fetch handler or inside an already-registered `waitUntil` chain. Calling it from an unawaited async closure means the isolate may be torn down before `waitUntil()` is invoked, silently dropping the side-effect (click recording, cache write, etc.).

The `custom-worker.ts` queue handler calls `ctx.waitUntil()` synchronously (lines 119, 181, 260), which is correct. The discrepancy between the two patterns suggests `runAfterResponse` may have higher drop rates than expected under load.

---

### NEW-03 — Privileged Client Proxy Does Not Guard `.rpc()` Calls

**File:** `lib/server-only/service-role.ts:126-134`
**Severity: Medium (tenant isolation gap)**

The Proxy on the privileged client intercepts `.from()` to enforce `site_id` filtering. However, **`.rpc()` calls bypass the proxy entirely** — the Proxy only overrides the `from` property getter. RPC calls like `sb.rpc("get_dashboard_stats", ...)` and `sb.rpc("get_niche_health_stats", ...)` go through the raw client without any tenant isolation check.

Currently, the RPC functions accept `p_site_id` as a parameter and filter internally, so the risk depends on correct usage at call sites. But the architectural guarantee provided by the F-API-01 proxy — "you cannot execute a query without a site_id filter" — does not extend to RPC calls. A new RPC function added without a `site_id` parameter would silently escape the guard.

Files using `.rpc()` through the privileged client:

- `lib/dal/dashboard-stats.ts:30` — passes `p_site_id` ✓
- `lib/dal/niche-health.ts:24` — no site filter (cross-tenant by design, but unguarded)
- `lib/dal/admin-users.ts:167-189` — atomic login counter RPC, no site_id (correct for global admin_users table)
- `app/api/cron/epc-recompute/route.ts` — uses `.rpc()` with `unsafeNoSiteFilter` on subsequent queries

---

### NEW-04 — `listAdminUsers()` Returns Unbounded Result Set

**File:** `lib/dal/admin-users.ts:76-89`
**Severity: Low (admin-only, but pattern violation)**

```typescript
export async function listAdminUsers(
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<AdminUserPublic[]> {
  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("id, email, name, role, is_active, ...")
    .unsafeNoSiteFilter()
    .order("created_at", { ascending: true });
  // No .limit() — fetches ALL admin users
```

Unlike every other list function in the DAL (which uses `clampPagination()`), `listAdminUsers()` has no limit. While the admin_users table is expected to be small (tens of users, not thousands), this violates the project-wide convention that all list queries must be bounded. If the table grows or is accidentally filled (e.g., a seed script bug), this query could return an arbitrarily large result.

---

## 3. Summary Table

| Issue  | Title                         | Verdict            | Severity   | Action Needed                                                   |
| ------ | ----------------------------- | ------------------ | ---------- | --------------------------------------------------------------- |
| #598   | Middleware 722 lines          | **CONFIRMED**      | Low        | Optional refactor; already partially decomposed                 |
| #597   | Thundering herd               | **FALSE POSITIVE** | N/A        | Close — single-flight pattern is in place                       |
| #607   | Cache cross-tenant leak       | **CONFIRMED**      | Medium     | Add cache invalidation race guard on domain reassignment        |
| #606   | Circuit breaker on CF Workers | **CONFIRMED**      | Low        | Accept or back with KV/DO (documented as low-priority)          |
| #605   | Dashboard unbounded queries   | **PARTIAL**        | Low-Medium | Add limit to `listAdminUsers`, cap niche health RPC             |
| #609   | Click queue no backpressure   | **CONFIRMED**      | Medium     | Add producer-side rate/depth check or circuit breaker           |
| #610   | AbortSignal dropped           | **PARTIAL**        | Low        | Forward signal to `getMiddlewareSiteRowByDomain` and rate-limit |
| #611   | `unsafeNoSiteFilter` overuse  | **CONFIRMED**      | Medium     | Add lint rule or CODEOWNER gate for opt-out usage               |
| #613   | Click dedup gaps              | **CONFIRMED**      | Low        | Accept as best-effort or add atomic check via DO                |
| NEW-01 | Allowlist parsed per request  | **NEW**            | Low        | Hoist to module scope                                           |
| NEW-02 | `runAfterResponse` async race | **NEW**            | Medium     | Call `waitUntil` synchronously in fetch handler                 |
| NEW-03 | RPC bypasses F-API-01 proxy   | **NEW**            | Medium     | Extend proxy to intercept `.rpc()` or add separate guard        |
| NEW-04 | `listAdminUsers` unbounded    | **NEW**            | Low        | Add `.limit()` or use `clampPagination()`                       |
