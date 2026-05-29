# Consolidated Audit Report — Resolution Status

**Date**: 2026-05-29 (rebaselined)
**Branch**: `main`
**Sources**: etap-0, etap-1, etap-2, etap-3, **Season 8** (**repo-scoped only**)

> **Rebaseline note (F2 remediation):** etap-5 and etap-6 findings originated
> from a different codebase (Oltigo Health) and have been **removed** from this
> register. The previous version carried 7 Oltigo items as N/A (MED #4, #5,
> #11, #14, #16; LOW #28, #29). Keeping foreign findings — even marked N/A —
> contaminates the audit trail and undermines compliance evidence. This file
> now contains only affilite-mix-scoped findings with provenance.

## Summary

| Priority  | Total  | Fixed  | Documented |
| --------- | ------ | ------ | ---------- |
| MEDIUM    | 13     | 9      | 4          |
| LOW       | 17     | 13     | 4          |
| **Total** | **30** | **22** | **8**      |

All 30 items addressed: 22 code-fixed, 8 documented with ADR/plan. 7 foreign (Oltigo Health) items removed during F2 rebaseline.

---

## MEDIUM Priority Items

### MED #1: Annotate 161 empty catch blocks ✅ FIXED

Only 4 were truly unannotated (rest had annotations). Fixed in `next.config.ts`,
`tenant-badge-switcher.tsx`, `admin-shell.tsx`, `workers/rate-limiter-do.ts`.

### MED #2: Per-tenant encryption plan ✅ DOCUMENTED

ADR-0010: `docs/adr/0010-per-tenant-encryption-keys.md` — 3-phase envelope encryption architecture.

### MED #3: Circuit breaker for external APIs ✅ FIXED

`lib/ai/circuit-breaker.ts` already existed. Now wired into `lib/ai/providers.ts` —
OPEN circuit breakers are skipped in the provider fallback chain.

### MED #6: Audit log retry queue ✅ ALREADY FIXED

`lib/audit-log.ts` has queue binding (Cloudflare Queue) + direct Supabase fallback with jittered retry.

### MED #7: AI output classifier ✅ ALREADY FIXED

`lib/ai/output-validation.ts` (189 lines) — validates format, quality gates, link allowlist.

### MED #8: Production chaos testing framework ✅ FIXED

- `scripts/chaos-drill.sh` — 4 scenarios (kv-outage, ai-provider, rate-limit, db-latency)
- `__tests__/chaos/` already has 2 resilience test files (6 tests)

### MED #9: Supabase connection pooling ✅ DOCUMENTED

ADR-0011: `docs/adr/0011-supabase-connection-pooling.md` — Supavisor upgrade + KV caching + read replicas.

### MED #10: Coverage threshold gate in CI ✅ ALREADY FIXED

`vitest.config.ts` lines 31-37: per-module thresholds. CI runs `npm run test:coverage`.

### MED #12: GDPR Art.18 restriction endpoint ✅ ALREADY FIXED

`app/api/admin/privacy/restrict/route.ts` — POST/DELETE with audit logging.

### MED #13: GDPR Art.21 objection endpoint ✅ FIXED

`app/api/admin/privacy/object/route.ts` — POST/DELETE with scope (marketing/profiling/analytics/all).
Migration: `2026052602_gdpr_art21_objections.sql`.

### MED #15: Pen test plan ✅ DOCUMENTED

`docs/penetration-test-plan.md` — scope, categories, timeline, vendor requirements, remediation SLAs.

---

## Season 8 Findings

### T1-01 (Medium — SSRF): Resolved IPv6 skips private-range re-check ✅ FIXED

`lib/ssrf-guard.ts:279-287` — `isBlockedIPv6Prefix(resolvedIp)` now validates
DNS-resolved IPv6 addresses against private/link-local ranges. Previously only
the input hostname was checked; a hostname resolving to an AAAA record (e.g.
`fd00::1`) would bypass the guard. Tests: `__tests__/ssrf-guard.test.ts:145-183`
(ULA, link-local, IPv6-mapped private IPv4). Fixed in PRs #584/#585.

### DB1-01 (Medium — Money): No UNIQUE on stripe_subscription_id ✅ FIXED

`supabase/migrations/2026052904_db1_01_unique_stripe_subscription_id.sql` —
Added `UNIQUE` partial index on `memberships.stripe_subscription_id` (WHERE NOT
NULL). Prevents duplicate subscription rows from concurrent/replayed webhooks.
Lock test: `__tests__/db1-01-unique-stripe-sub.test.ts`. Fixed in PR #614.

### I2-01 (Low — Injection): Cursor ORDER BY lacks runtime allow-list ✅ FIXED

`lib/dal/cursor-pagination.ts:31-41` — `ALLOWED_ORDER_COLUMNS` set restricts
`orderColumn` to a known-safe list. Runtime rejection at lines 99-104 throws on
any value outside the set, preventing PostgREST filter injection. Tests:
`__tests__/cursor-pagination.test.ts:30-77`. Fixed in PRs #584/#585.

### P7-03 (Low — DoS): SSRF DNS resolve has no timeout ✅ FIXED

`lib/ssrf-guard.ts:19-28` — `DNS_TIMEOUT_MS = 5_000` with `Promise.race`
wrapper around `dns.lookup`. Prevents resolver stalls from blocking the
request indefinitely. Fixed in PRs #584/#585.

---

## LOW Priority Items

### LOW #17: Console.log annotations ✅ FIXED

All 9 remaining `console.*` calls verified as justified:

- `lib/logger.ts` (3): the structured logger backend itself
- `lib/sentry.ts` (2): fallback error reporting when Sentry unavailable
- `lib/report-error.ts` (1): client-side error boundary (browser devtools)
- `app/web-vitals.tsx` (1): dev-only, guarded by `NODE_ENV === "development"`
- `app/(public)/components/ad-slot.tsx` (1): annotated with ACCEPTED comment

### LOW #18: deploy.yml composite action extraction ✅ FIXED

Extracted 2 composite actions:

- `.github/actions/validate-bindings/` — F-007 binding validation
- `.github/actions/health-check/` — post-deploy health gate with CF Bot Fight Mode retry

### LOW #19: Migration squashing strategy ✅ DOCUMENTED

ADR-0013: `docs/adr/0013-migration-squashing.md` — baseline snapshot + quarterly squash cadence.

### LOW #20: `:any` in service-role.ts ✅ DOCUMENTED

The `any` types in `lib/server-only/service-role.ts` (wrapTable/wrapBuilder) are inherent to
the Proxy-based tenant isolation pattern. Added ACCEPTED comment at the `as any` call site.

### LOW #21: @ts-expect-error directive ✅ FIXED

Updated comment in `app/api/cron/data-retention/route.ts:160` to ACCEPTED annotation with
clear rationale (generated types show `Args: never` for `purge_retention` RPC).

### LOW #22: eslint-disable directive sweep ✅ VERIFIED

53 directives: 52 are `no-restricted-syntax` with existing audit comments, 1 is `no-img-element`.
All are justified and documented.

### LOW #23: .skip test justification ✅ VERIFIED

Only 2 `.skip()` calls — both are self-documenting:

- `newsletter-unsubscribe-abuse.test.ts:302`: skipped when env vars not set
- `rls-isolation.integration.test.ts:289`: skipped when not pointing at real DB

### LOW #24: Subdomain cache LRU cap ✅ ALREADY FIXED

`lib/security/unknown-host-guard.ts` (G-34): per-isolate LRU cap (100 hosts/1s window),
negative cache TTL ramp (5 min → 1 hour exponential).

### LOW #25: Focus ring styling ✅ FIXED

Added WCAG 2.4.7 `:focus-visible` system to `app/globals.css` — 2px ring using `--ring` token,
`:focus:not(:focus-visible)` removes default outline for mouse users.

### LOW #26: Load testing setup ✅ FIXED

`scripts/load-test.mjs` — zero-dependency Node.js load tester with configurable concurrency,
duration, P99 metrics, and 5% error rate threshold.

### LOW #27: Automated access review logs ✅ FIXED

`app/api/cron/access-review/route.ts` — SOC 2 CC6.1 recertification cron.
Migration: `2026052603_access_review_log.sql`.
Flags: inactive 90d+ accounts, super_admin roles for manual review.

### LOW #30: Terraform for Supabase ✅ DOCUMENTED

ADR-0012: `docs/adr/0012-infrastructure-as-code.md` — Cloudflare Terraform → Supabase Terraform → full state.

### LOW #31: ab-testing `as any` ✅ FIXED

Replaced 3 instances of `(sb.from as any)("table")` with `untypedFrom(sb, "table")`
in `lib/ab-testing.ts`.

### LOW #32: service-role `as any` ✅ DOCUMENTED

Added ACCEPTED comment at `lib/server-only/service-role.ts:127` — the `as any` is
inherent to the dynamic Proxy pattern and cannot be removed.

### LOW #33: AI red team plan ✅ DOCUMENTED

`docs/ai-red-team-plan.md` — threat model (prompt injection, SEO spam, cost exhaustion),
test cases, timeline, success criteria.
