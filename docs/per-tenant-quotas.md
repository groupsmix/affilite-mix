# Per-Tenant Cost & Quota Primitives

Audit finding: **G-42 — Per-tenant cost / quota primitives**.

Before this change the platform enforced only **global** ceilings:
rate limits in `lib/rate-limit.ts`, the static AI prompt cap in
`lib/ai/prompt-sanitization.ts`, and the per-upload `R2_MAX_UPLOAD_BYTES`
constant in `lib/r2.ts`. There was no way to express "tenant **A**
gets 1M AI tokens / month while tenant **B** is unlimited" — every
tenant shared the same hard-coded ceiling.

`lib/quotas.ts` adds the missing per-tenant layer. It is intentionally
designed as **primitives** (read / check / record / assert) rather than
an opinionated gateway; the existing rate-limit module is the
security-grade ceiling and continues to gate all public endpoints.

## Resource Taxonomy

| Resource            | Window     | Default env var                             | Override field           |
| ------------------- | ---------- | ------------------------------------------- | ------------------------ |
| `ai_tokens`         | month      | `QUOTA_DEFAULT_AI_TOKENS_PER_MONTH`         | `aiTokensPerMonth`       |
| `ai_cost_micro_usd` | month      | `QUOTA_DEFAULT_AI_COST_MICRO_USD_PER_MONTH` | `aiCostMicroUsdPerMonth` |
| `ai_requests`       | day        | `QUOTA_DEFAULT_AI_REQUESTS_PER_DAY`         | `aiRequestsPerDay`       |
| `r2_storage_bytes`  | cumulative | `QUOTA_DEFAULT_R2_STORAGE_BYTES`            | `r2StorageBytes`         |
| `r2_egress_bytes`   | month      | `QUOTA_DEFAULT_R2_EGRESS_BYTES_PER_MONTH`   | `r2EgressBytesPerMonth`  |

- **Window semantics**
  - `month` — counter resets on the first of each calendar month UTC.
  - `day` — counter resets at 00:00 UTC.
  - `cumulative` — counter never resets (use it for storage-class
    accounting; pair with a finalize/delete signal to credit usage
    back when a tenant deletes media).
- **Resolution order**: `SiteDefinition.quotas.<override>` →
  `<env default>` → unlimited.
- **Storage backend**: `RATE_LIMIT_KV` (existing Cloudflare KV
  namespace). Keys are namespaced as
  `quota:{siteId}:{resource}:{window-key}`.

## Configuring a Tenant Override

Each entry in `config/sites/*.ts` may declare an optional `quotas`
block:

```ts
import { defineSite } from "../define-site";

export const cryptoToolsSite = defineSite({
  id: "crypto-tools",
  // ...existing fields...
  quotas: {
    aiTokensPerMonth: 1_500_000,
    aiCostMicroUsdPerMonth: 25_000_000, // $25 ceiling
    aiRequestsPerDay: 250,
    r2StorageBytes: 5 * 1024 * 1024 * 1024, // 5 GiB
    r2EgressBytesPerMonth: 50 * 1024 * 1024 * 1024, // 50 GiB
  },
});
```

Sites without a `quotas` block inherit the env defaults. Sites that
exist only in the database (created via `/api/admin/sites`) also
inherit the env defaults — the static config remains optional.

## API Surface (`lib/quotas.ts`)

```ts
import { checkQuota, assertQuota, recordUsage, getUsageSnapshot } from "@/lib/quotas";

// 1. Pre-flight check (read-only)
const r = await checkQuota("crypto-tools", "ai_tokens", 4_000);
if (!r.allowed) return new Response("over quota", { status: 429 });

// 2. Assert / throw  — convenience wrapper around checkQuota
await assertQuota("crypto-tools", "ai_requests");

// 3. Record after a successful side-effect
await recordUsage("crypto-tools", "ai_tokens", 1_872);

// 4. Admin dashboard — full snapshot
const snap = await getUsageSnapshot("crypto-tools");
```

All four helpers return / accept structured types — see `lib/quotas.ts`
for the exact shapes.

## Wiring

- `lib/ai/providers.ts:generateWithFallback(prompt, systemPrompt, { siteId })`
  - **Pre-flight**: `assertQuota(siteId, "ai_requests")` and
    `assertQuota(siteId, "ai_tokens", estimateTokens(prompt + system))`.
  - **Post-flight**: fire-and-forget `recordUsage` for `ai_requests`,
    `ai_tokens` (input + output estimate), and `ai_cost_micro_usd`
    derived from the resolved provider's price card on the
    `AIProvider.pricing` field.
  - `QuotaExceededError` short-circuits the provider fallback loop —
    we don't want to roll over to the next provider when the limit
    (not the upstream) is the cause of the failure.
- `lib/r2.ts:getUploadUrl(contentType, contentLength, { siteId })`
  - **Pre-flight**: `assertQuota(siteId, "r2_storage_bytes", contentLength)`.
  - **Pessimistic accounting**: usage is recorded BEFORE the presign
    URL is returned. A follow-up finalize hook in
    `/api/admin/upload/finalize` is the right place to reconcile
    against actual upload completion; the primitive is already
    exposed (`recordUsage(..., -bytes)` is acceptable for credits).

## Failure Mode

- **Quota infrastructure (this module)**: fail OPEN. KV outages must
  not brick AI generation or media uploads — accounting is an
  operational concern, not a security boundary.
- **Rate limits (`lib/rate-limit.ts`)**: unchanged — they remain the
  security-grade ceiling and continue to fail closed after
  `KV_GRACE_MS`.

## Operator Runbook

- **View current usage for a tenant**:
  ```ts
  await getUsageSnapshot("<site-id>");
  ```
  Reachable from an admin endpoint; the underlying KV keys can also
  be inspected with `wrangler kv key list --binding RATE_LIMIT_KV`.
- **Override a single tenant ceiling temporarily**: set the matching
  KV key to `{"count": <new>}`. The window-specific TTL applies on
  next write so manual tweaks self-expire.
- **Reset a counter**: delete the key:
  ```bash
  wrangler kv key delete --binding RATE_LIMIT_KV "quota:<site>:<resource>:<window>"
  ```
- **Drift between estimated and actual tokens**: `lib/quotas.ts`
  records `estimateTokens()` (~4 chars/token). Real provider-reported
  token counts can be plumbed through later by widening
  `recordUsage()` to accept a structured payload — the storage layer
  already supports it.

## Why Primitives Instead of a Gateway?

- The existing `lib/rate-limit.ts` already provides a security-grade
  middleware with a Durable Object preferred path. Re-implementing
  that pattern for cost accounting risks divergence and would muddy
  failure semantics (DO-backed enforcement implies fail-closed; cost
  accounting wants fail-open). Keeping the two modules separate makes
  the security boundary obvious in code review.
- AI calls happen from many surfaces (admin API, cron, queue
  consumers) — a primitive API is easier to plumb through every call
  site than a request-bound middleware.

## Related

- `docs/ai-governance.md` — drops the "Open follow-up: per-tenant
  spend attribution" caveat; this module closes that gap.
- `docs/sbom-retention.md` — the other half of the audit pair (G-41).
- `lib/rate-limit.ts` — request-rate ceilings (security boundary).
