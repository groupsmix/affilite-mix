# Season 10 — QA & Issue Triage Report

**Date:** 2026-05-29
**Auditor:** Devin (automated QA session)
**Branch:** `main` (HEAD at time of audit)

---

## Validation Results

| Check               | Result                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `npm install`       | ✅ Clean (0 vulnerabilities)                                                                                                       |
| `npx vitest run`    | ✅ **162 test files passed**, 5 skipped (167 total) — **2328 tests passed**, 24 skipped (2352 total), 0 failures — Duration 51.53s |
| `npm run lint`      | ✅ Clean (0 warnings, 0 errors)                                                                                                    |
| `npm run typecheck` | ✅ Clean (0 errors)                                                                                                                |
| `npx knip`          | ✅ "Excellent, Knip found no issues."                                                                                              |

---

## Open Issue Triage (21 issues)

### ALREADY FIXED (4)

| #   | Title                                            | Verdict           | Evidence                                                                                                                                                                                  |
| --- | ------------------------------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 613 | [S9-M2] Click tracking has no dedup              | **ALREADY FIXED** | `app/api/queue/clicks/route.ts:382-387` — now uses `.upsert(rows, { onConflict: "click_id", ignoreDuplicates: true })`. Retried queue messages with same `click_id` are silently skipped. |
| 604 | [RISK-SEC-01] bcrypt 72-byte truncation          | **ALREADY FIXED** | `lib/password.ts:100-101` — hard rejects passwords >72 bytes UTF-8: `if (new TextEncoder().encode(password).byteLength > 72) throw`. No silent truncation possible.                       |
| 599 | [AUDIT-M6] Health check does not verify Supabase | **ALREADY FIXED** | `app/api/health/route.ts` — authenticated health endpoint queries `sites` table with latency tracking, returns 503 on failure.                                                            |
| 594 | [AUDIT-H3] TOTP encryption key has no rotation   | **ALREADY FIXED** | `lib/totp-encryption.ts` — versioned envelope (A100-05) supports `TOTP_ENCRYPTION_KEY` (v1) and `TOTP_ENCRYPTION_KEY_V2`. Transparent re-encryption on login.                             |

### VERIFIED — Real Issues (13)

| #   | Title                                                  | Verdict                            | Evidence                                                                                                                              |
| --- | ------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 611 | [S9-H4] unsafeNoSiteFilter() not ESLint-guarded        | **VERIFIED**                       | Used in 6+ DAL modules. No `no-restricted-syntax` rule in `eslint.config.mjs` restricts it.                                           |
| 609 | [S9-H2] Click queue consumer — no backpressure         | **VERIFIED** (partially mitigated) | Batch size capped at 200, but no cross-isolate concurrency limit or circuit breaker on Supabase inserts.                              |
| 606 | [S9-C2] Per-isolate circuit breaker ineffective        | **VERIFIED** (documented/accepted) | `lib/ai/circuit-breaker.ts:14-23` explicitly documents per-isolate limitation. Fallback chain is primary availability mechanism.      |
| 603 | [RISK-PRIV-01] No self-service DSAR portal             | **VERIFIED**                       | All privacy endpoints admin-only. No self-service DSAR endpoint exists.                                                               |
| 602 | [RISK-AI-05] AI disclosure machine-only                | **VERIFIED** (partially mitigated) | Machine-readable meta tag + data attribute exist. No visible human-readable label on content.                                         |
| 601 | [RISK-PRIV-04] No CSAM hash matching                   | **VERIFIED**                       | UGC image uploads have URL validation only. No perceptual hash scanning or PhotoDNA integration.                                      |
| 600 | [RISK-PRIV-03] R2 defaults to WNAM                     | **VERIFIED**                       | `terraform/cloudflare/storage.tf:15` defaults to `"WNAM"`. Contradicts `docs/data-residency.md` claim of "Auto".                      |
| 598 | [AUDIT-H4] Middleware 722-line monolith                | **VERIFIED**                       | 722 lines confirmed. Helpers extracted to `lib/` but orchestration remains monolithic.                                                |
| 597 | [AUDIT-H2] No Supabase connection management           | **VERIFIED** (documented/accepted) | Per-isolate caching with TTL exists, but no cross-isolate pooling. Inherent to Workers architecture.                                  |
| 596 | [AUDIT-H1] 121+ migrations without squashing           | **VERIFIED**                       | 245 files in `supabase/migrations/`. ADR-0013 is "Proposed" status — not executed.                                                    |
| 595 | [AUDIT-H5] No automated rollback for failed migrations | **VERIFIED**                       | Deploy runs migrations forward; `rollback.yml` is manual-only (`workflow_dispatch`).                                                  |
| 588 | [AUDIT-C2] Silent cron job failures                    | **VERIFIED** (partially mitigated) | Unknown schedule path returns without `captureException()`. Sentry wrap may capture `console.error` but explicit alerting is missing. |
| 586 | [RISK-OBS-01] Production alerting not wired            | **VERIFIED**                       | `alert_mechanisms` defaults to empty lists. No notification policies fire without operator-provided IDs.                              |

### VERIFIED — Accepted Risk / Dashboard Check Needed (3)

| #   | Title                                            | Verdict                        | Evidence                                                                                                                               |
| --- | ------------------------------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 593 | [RISK-TEST-01] Global coverage at 23%            | **VERIFIED** (accepted risk)   | Downgraded to HIGH. Risk-weighted coverage on critical paths is adequate. Stryker mutation testing configured. 2328 tests, 0 failures. |
| 591 | [RISK-BC-02] R2 versioning — verify bucket state | **VERIFIED** (dashboard check) | Terraform HCL declares versioning + `prevent_destroy`. Actual bucket state needs dashboard/API verification.                           |
| 589 | [RISK-BC-01] DR drills — verify PITR             | **VERIFIED** (dashboard check) | `dr-drill.yml` and `backup-restore-drill.yml` workflows exist. PITR needs Supabase dashboard verification.                             |

### ACTION NEEDED — Ops Task (1)

| #   | Title                                     | Verdict                   | Evidence                                                                                                |
| --- | ----------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------- |
| 551 | Cleanup: delete inactive Supabase project | **VERIFIED** (ops action) | No code references to `iepwmogpuoochvusmlhs` remain. Manual deletion via Supabase dashboard/API needed. |

---

## Open PRs Review

No open PRs from other sessions at time of audit.

---

## Summary

- **21 open issues triaged** (all code-verified)
- **4 already fixed** — can be closed
- **13 verified real issues** — remain open
- **3 accepted risk / dashboard verification** — lower priority
- **1 ops cleanup task** — manual action needed
- **Codebase health:** All tests pass, lint clean, typecheck clean, no dead code (knip clean)
