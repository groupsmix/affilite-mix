# Re-Audit Verification — Season 1 & Season 2 Findings

**Repository:** `groupsmix/affilite-mix`
**Branch:** `main` (post-merge of PRs #694–#698)
**Re-Auditor:** Devin (Principal Engineer)
**Date:** 2026-05-29
**Scope:** Verify that fixes from PRs #694, #695, #696, #698 properly addressed the Season 1 (Code & Data Layer) and Season 2 (Infra, API & Web) audit findings.

---

## PRs Under Review

| PR   | Title                                                                          | Key Changes                                                                                     |
| ---- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| #694 | cleanup(dal,cron): DRY column-fallback, DRY network ingest, captureException  | DRY `categories.ts`, DRY `commission-ingest`, `captureException` in 4 cron routes               |
| #695 | fix(security): address Critical/High findings from Season 4 audit             | LRU 10K→50K, absolute session lifetime, timing-safe compare test, revoked-token test, cron auth test, flag registry |
| #696 | fix(compliance): address Medium findings from Season 3 audit                  | GDPR data export, CCPA disclosures, cookie consent reject button, circuit breakers, AI cron cursor |
| #698 | fix(i18n): use translation keys in newsletter email templates                 | Newsletter i18n (EN + AR) for confirmation emails                                               |

> **Note:** PRs #694–#696 and #698 primarily target Season 3 and Season 4 findings. Their overlap with Season 1/Season 2 findings is indirect — most S1/S2 findings were either already compliant (Info) at audit time, or required dedicated follow-up that was not part of these PRs. The table below documents the current status of every S1/S2 finding.

---

## Season 1 — Code & Data Layer (A1–A30)

### [A1] Taint-Flow Per Line

| Finding ID | Original Severity | Status         | Evidence (file:line or PR#)                     | Notes                                                                                       |
| ---------- | ----------------- | -------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| A1-001     | Medium            | ACCEPTED RISK  | `app/r/[shortcode]/route.ts:84-96`              | Mitigated by `validateAffiliateDomain` domain-allowlist. Original audit accepted.            |
| A1-002     | Low               | ACCEPTED RISK  | `app/(public)/components/html-renderer.tsx:31`   | `sanitizeHtmlMemoized` allowlist approach unchanged. Maintenance recommendation only.        |
| A1-003     | Low               | NOT APPLICABLE | `app/layout.tsx:135`                             | Server-controlled data + CSP nonce. No fix needed.                                           |
| A1-004     | Low               | ACCEPTED RISK  | `lib/r2.ts`, `lib/admin-url-guard.ts`            | Presigned URLs server-derived; `validateAdminUrl` blocks private IPs. Original audit accepted. |
| A1-005     | Info              | ACCEPTED RISK  | `lib/ai/prompt-sanitization.ts:1-80`             | Well-hardened prompt sanitizer. Maintenance recommendation only.                              |
| A1-006     | Info              | NOT APPLICABLE | `lib/admin-guard.ts:102-110`                     | Properly validated. No fix needed.                                                           |

### [A2] Hostile-Author Backdoor Hunt

| Finding ID | Original Severity | Status         | Evidence                                        | Notes                                                   |
| ---------- | ----------------- | -------------- | ----------------------------------------------- | ------------------------------------------------------- |
| A2-001     | Info              | NOT APPLICABLE | `lib/auth.ts:DUMMY_HASH_SUFFIX`                 | Intentional timing-equalization constant.                |
| A2-002     | Info              | NOT APPLICABLE | `lib/jwt-secret.ts:DEV_ONLY_JWT_SECRET`          | Properly gated by `NODE_ENV === "production"`.           |

### [A3] STRIDE Threat Model

All STRIDE scenarios were assessed as properly mitigated at audit time. **No changes from PRs #694–#698 affect STRIDE mitigations.** Status: **NOT APPLICABLE** (no findings requiring fixes).

### [A4] OWASP Top 10 + API Top 10

All controls were PASS at audit time. **No changes from PRs #694–#698 alter these controls.** Status: **NOT APPLICABLE** (no findings requiring fixes).

### [A5] Injection-Sink Census

| Finding ID | Original Severity | Status        | Evidence                               | Notes                                                          |
| ---------- | ----------------- | ------------- | -------------------------------------- | -------------------------------------------------------------- |
| A5-001     | Low               | ACCEPTED RISK | `lib/dal/audit-log.ts:93`              | Mitigated via `stripPostgrestMeta()`. Unchanged.               |
| A5-002     | Low               | ACCEPTED RISK | `lib/dal/products.ts:342`              | Mitigated via `toTsquery()`. Unchanged.                        |
| A5-003     | Low               | ACCEPTED RISK | `lib/dal/content.ts:305`               | Same pattern as A5-002. Unchanged.                             |
| A5-004     | Low               | ACCEPTED RISK | `lib/internal-links.ts:43,123`         | Regex-escaped before construction. Unchanged.                  |
| A5-005     | Info              | NOT APPLICABLE | `lib/sanitize-html.ts`                | Properly escaped. No fix needed.                               |

### [A6] Crypto Audit

| Finding ID | Original Severity | Status         | Evidence                              | Notes                          |
| ---------- | ----------------- | -------------- | ------------------------------------- | ------------------------------ |
| A6-001     | Info              | NOT APPLICABLE | `lib/totp-encryption.ts`              | Sound crypto. No fix needed.   |
| A6-002     | Info              | NOT APPLICABLE | `lib/password.ts`                     | Sound design. No fix needed.   |
| A6-003     | Info              | NOT APPLICABLE | `lib/hmac-key.ts`                     | Sound HKDF. No fix needed.     |
| A6-004     | Info              | NOT APPLICABLE | `lib/csrf.ts:generateCsrfToken()`     | Correct CSPRNG. No fix needed. |
| A6-005     | Info              | NOT APPLICABLE | `lib/csrf.ts:timingSafeCompare()`     | Correct timing-safe. No fix needed. Test added in PR #695 (`__tests__/csrf.test.ts:46-49`). |
| A6-006     | Info              | NOT APPLICABLE | `lib/jwt-secret.ts`                   | Appropriate for Workers. No fix needed. |
| A6-007     | Info              | NOT APPLICABLE | `lib/totp-encryption.ts`              | Well-designed rotation. No fix needed. |

### [A7] AuthN/AuthZ Decision Tree

| Finding ID | Original Severity | Status      | Evidence                                         | Notes                                                                                                                              |
| ---------- | ----------------- | ----------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| A7-001     | Info              | NOT APPLICABLE | `app/api/auth/login/route.ts`                 | Sound multi-layer authentication. No fix needed.                                                                                   |
| A7-002     | Info              | NOT APPLICABLE | `lib/authz.ts:withAuthz()`                    | IDOR-resistant. No fix needed.                                                                                                     |
| A7-003     | Info              | NOT APPLICABLE | `lib/auth.ts`                                 | Well-structured JWT. No fix needed.                                                                                                |
| A7-004     | Info              | NOT APPLICABLE | `middleware.ts` + `lib/csrf.ts`               | Comprehensive CSRF. No fix needed.                                                                                                 |
| A7-005     | Info              | NOT APPLICABLE | `lib/auth.ts`                                 | Session binding verified. No fix needed. PR #695 adds absolute session lifetime caps (`lib/auth-constants.ts:59-60`, `app/api/auth/login/route.ts:506-521`). |
| A7-006     | Medium            | FIXED       | `lib/authz.ts:147-162` (RESOURCE_TABLES)         | **Previously:** `authorizeResource` covered 5 entity types (`product`, `content`, `page`, `ad`, `category`). **Now:** Expanded to 14 types including `deal`, `quiz`, `drip_campaign`, `commission`, `membership`, `module`, `ai_draft`, `affiliate_network`, `scheduled_job`. Addressed by earlier PRs (pre-#694), confirmed present on `main`. |

### [A8] Error-Handler & Logger Review

| Finding ID | Original Severity | Status         | Evidence                                                    | Notes                                                                                                                |
| ---------- | ----------------- | -------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| A8-001     | Info              | NOT APPLICABLE | `lib/logger.ts:DENIED_LOG_FIELDS`                           | 30+ PII fields denylisted. Unchanged.                                                                                |
| A8-002     | Info              | NOT APPLICABLE | `lib/api-error.ts:redactDetails()`                          | Stack traces stripped. Unchanged.                                                                                    |
| A8-003     | Info              | FIXED          | PR #694: 4 cron routes now call `captureException()`         | **Fixed by PR #694.** `expire-deals/route.ts:25`, `epc-recompute/route.ts:128`, `price-scrape/route.ts:206`, `stripe-sync/route.ts:128`. Previously logged errors but did not report to Sentry. |
| A8-004     | Low               | ACCEPTED RISK  | `app/api/membership/webhook/route.ts`                        | Stripe error messages redacted. Unchanged.                                                                           |

### [A9] Dependency Audit

| Finding ID | Original Severity | Status        | Evidence          | Notes                                                                                  |
| ---------- | ----------------- | ------------- | ----------------- | -------------------------------------------------------------------------------------- |
| A9-001     | Info              | NOT APPLICABLE | `package.json`   | Dependencies current. No fix needed.                                                   |
| A9-002     | Info              | NOT APPLICABLE | `knip.json`      | Dead-export detection maintained. No fix needed.                                        |
| A9-003     | Info              | NOT APPLICABLE | `package.json`   | No copyleft contamination. No fix needed.                                              |
| A9-004     | Low               | STILL OPEN    | `package.json`   | Most deps still use `^` (caret) ranges. `bcryptjs`, `jose`, `next` use `~` (tilde). Consider `~` for `@supabase/supabase-js`, `stripe`. Not addressed by PRs #694–#698. |

### [A10] Race Conditions, TOCTOU, Integer Overflow

| Finding ID | Original Severity | Status        | Evidence                                    | Notes                                                                                                |
| ---------- | ----------------- | ------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| A10-001    | Info              | NOT APPLICABLE | `app/api/auth/login/route.ts:338-341`      | Atomic increment. No fix needed.                                                                     |
| A10-002    | Info              | NOT APPLICABLE | `lib/dal/pagination-guard.ts`              | Pagination clamped. No fix needed.                                                                   |
| A10-003    | Info              | NOT APPLICABLE | `app/api/auth/login/route.ts:328`          | Correct `>=` comparison. No fix needed.                                                              |
| A10-004    | Low               | STILL OPEN    | `lib/rate-limit.ts`                         | KV read-then-write race still exists. PR #695 increased LRU cap (10K→50K, `lib/rate-limit.ts:253-264`) but the fundamental race is in KV, not LRU. DO-based limiter (`RATE_LIMITER_DO`) recommended for production. |
| A10-005    | Info              | NOT APPLICABLE | DAL layer                                  | Consistent error handling. No fix needed.                                                            |

### [A11] ReDoS

All regex patterns were assessed as safe at audit time (A11-001 through A11-006). **No changes from PRs #694–#698 affect regex patterns.** Status: **NOT APPLICABLE** (no findings requiring fixes).

### [A12] Resource-Leak Audit

All items assessed as compliant (A12-001 through A12-004). **No changes.** Status: **NOT APPLICABLE**.

### [A13] Secrets Hunt

All items assessed as compliant (A13-001, A13-002). **No changes.** Status: **NOT APPLICABLE**.

### [A14] Input Validation Per Field

All items assessed as compliant (A14-001 through A14-007). **No changes.** Status: **NOT APPLICABLE**.

### [A15] Output Encoding Per Context

All items assessed as compliant (A15-001 through A15-005). **No changes.** Status: **NOT APPLICABLE**.

### [A16] Schema Review

| Finding ID | Original Severity | Status         | Evidence                                       | Notes                                             |
| ---------- | ----------------- | -------------- | ---------------------------------------------- | ------------------------------------------------- |
| A16-001    | Info              | NOT APPLICABLE | `supabase/migrations/00001_initial_schema.sql` | UUID PKs. No fix needed.                          |
| A16-002    | Info              | NOT APPLICABLE | `00001_initial_schema.sql`                     | Correct nullability. No fix needed.               |
| A16-003    | Info              | NOT APPLICABLE | `00089_standardize_money_columns.sql`          | Correct DECIMAL for money. No fix needed.         |
| A16-004    | Info              | NOT APPLICABLE | `00001_initial_schema.sql`                     | Comprehensive CHECK constraints. No fix needed.   |
| A16-005    | Info              | NOT APPLICABLE | `00001_initial_schema.sql`                     | Correct FK with cascading. No fix needed.         |
| A16-006    | Info              | NOT APPLICABLE | `00001_initial_schema.sql`                     | Correct uniqueness constraints. No fix needed.    |
| A16-007    | Info              | NOT APPLICABLE | `00001_initial_schema.sql` + `2026052303`      | Good index coverage. No fix needed.               |

### [A17] Query Analysis

| Finding ID | Original Severity | Status        | Evidence                              | Notes                                                                                    |
| ---------- | ----------------- | ------------- | ------------------------------------- | ---------------------------------------------------------------------------------------- |
| A17-001    | Info              | NOT APPLICABLE | `lib/dal/*.ts`                       | All parameterized. No fix needed.                                                        |
| A17-002    | Info              | NOT APPLICABLE | `lib/dal/content-products.ts:46`     | Batch operation. No fix needed.                                                          |
| A17-003    | Low               | STILL OPEN    | `lib/dal/products.ts:93`             | `missingUrl` filter may not use index. Partial index not yet added. Not addressed by PRs #694–#698. |
| A17-004    | Info              | NOT APPLICABLE | `lib/dal/pagination-guard.ts`        | Pagination capped. No fix needed.                                                        |
| A17-005    | Info              | NOT APPLICABLE | `lib/dal/products.ts:countProducts()` | Efficient count. No fix needed.                                                          |

### [A18] Transactions / Isolation

| Finding ID | Original Severity | Status        | Evidence                                     | Notes                                                                                              |
| ---------- | ----------------- | ------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| A18-001    | Info              | NOT APPLICABLE | `lib/dal/admin-users.ts`                    | Atomic increment. No fix needed.                                                                   |
| A18-002    | Info              | NOT APPLICABLE | `lib/dal/products.ts:updateProduct()`        | OCC pattern. No fix needed.                                                                        |
| A18-003    | Low               | STILL OPEN    | `app/api/cron/publish/route.ts`              | Non-transactional batch. Idempotent retry is acceptable mitigation but wrapping RPC would be stronger. Not addressed by PRs #694–#698. |
| A18-004    | Info              | NOT APPLICABLE | Supabase default                             | READ COMMITTED appropriate. No fix needed.                                                          |

### [A19] Migrations

All items assessed as compliant (A19-001 through A19-005). **No changes.** Status: **NOT APPLICABLE**.

### [A20] SQLi Sweep

All items assessed as compliant (A20-001 through A20-004). **No changes.** Status: **NOT APPLICABLE**.

### [A21] Data-at-Rest Encryption

| Finding ID | Original Severity | Status        | Evidence                         | Notes                                                                                                   |
| ---------- | ----------------- | ------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| A21-001    | Info              | NOT APPLICABLE | `lib/totp-encryption.ts`        | Strong app-level encryption. No fix needed.                                                             |
| A21-002    | Info              | NOT APPLICABLE | `lib/password.ts`               | One-way hashing. No fix needed.                                                                         |
| A21-003    | Info              | NOT APPLICABLE | `lib/reset-token.ts`            | Correct token storage. No fix needed.                                                                   |
| A21-004    | Info              | NOT APPLICABLE | `lib/newsletter-token.ts`       | Correct hashing. No fix needed.                                                                         |
| A21-005    | Medium            | STILL OPEN    | `lib/dal/admin-users.ts`         | Admin emails still stored in plaintext. RLS restricts to service_role. Consider app-level encryption for GDPR Art. 32. Not addressed by PRs #694–#698. |
| A21-006    | Info              | NOT APPLICABLE | Supabase                        | Platform-level encryption active. No fix needed.                                                        |

### [A22] Backup/Restore

| Finding ID | Original Severity | Status        | Evidence                               | Notes                                                                                              |
| ---------- | ----------------- | ------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| A22-001    | Info              | NOT APPLICABLE | Supabase Platform                     | PITR available. No fix needed.                                                                     |
| A22-002    | Low               | STILL OPEN    | N/A                                    | No app-level backup mechanism. Relies on Supabase. Not addressed by PRs #694–#698.                 |
| A22-003    | Info              | NOT APPLICABLE | `app/api/cron/data-retention/route.ts` | Data retention cron exists. No fix needed.                                                          |

### [A23] Over-Fetching

All items assessed as compliant (A23-001 through A23-003). **No changes.** Status: **NOT APPLICABLE**.

### [A24] Connection Pool

All items assessed as compliant (A24-001 through A24-004). **No changes.** Status: **NOT APPLICABLE**.

### [A25] Stored Procs/Triggers

All items assessed as compliant (A25-001 through A25-004). **No changes.** Status: **NOT APPLICABLE**.

### [A26] Normalization Tradeoffs

All items assessed as acceptable (A26-001 through A26-003). **No changes.** Status: **NOT APPLICABLE**.

### [A27] Soft-Delete

| Finding ID | Original Severity | Status        | Evidence                  | Notes                                                                                              |
| ---------- | ----------------- | ------------- | ------------------------- | -------------------------------------------------------------------------------------------------- |
| A27-001    | Info              | NOT APPLICABLE | `lib/dal/sites.ts:273`   | Correct role-gated deletion. No fix needed.                                                        |
| A27-002    | Info              | NOT APPLICABLE | `lib/dal/content.ts`     | Correct archiving. No fix needed.                                                                  |
| A27-003    | Info              | NOT APPLICABLE | RLS policies             | Correct RLS exclusion. No fix needed.                                                              |
| A27-004    | Low               | STILL OPEN    | `supabase/migrations`    | No partial indexes for soft-delete patterns. Not addressed by PRs #694–#698.                       |

### [A28] Time/Timezone

All items assessed as compliant (A28-001 through A28-004). **No changes.** Status: **NOT APPLICABLE**.

### [A29] Numeric Precision

All items assessed as compliant (A29-001 through A29-003). **No changes.** Status: **NOT APPLICABLE**.

### [A30] Replication/Sharding

| Finding ID | Original Severity | Status        | Evidence                                  | Notes                                                       |
| ---------- | ----------------- | ------------- | ----------------------------------------- | ----------------------------------------------------------- |
| A30-001    | Info              | NOT APPLICABLE | `supabase/migrations/00064_*`, `00067_*` | Correct tenant isolation. No fix needed.                    |
| A30-002    | Info              | NOT APPLICABLE | `lib/read-after-write.ts`                | Correct primary-read pattern. No fix needed.                |
| A30-003    | Low               | ACCEPTED RISK | Architecture                             | Supabase-coupled. DAL abstraction provides migration surface. Acceptable tradeoff. |
| A30-004    | Info              | NOT APPLICABLE | Cloudflare Workers                       | Stateless. No fix needed.                                   |

---

## Season 2 — Infra, API & Web (A31–A60)

### [A31] IaC (Terraform)

| Finding ID | Original Severity | Status        | Evidence                             | Notes                                                                             |
| ---------- | ----------------- | ------------- | ------------------------------------ | --------------------------------------------------------------------------------- |
| A31-01     | Low               | STILL OPEN    | `terraform/cloudflare/storage.tf`    | R2 buckets still lack ownership tags/comments. Not addressed by PRs #694–#698.    |
| A31-02     | Info              | ACCEPTED RISK | `terraform/cloudflare/storage.tf`    | No CMK available on R2. Acceptable for threat model.                              |
| A31-03     | Info              | NOT APPLICABLE | N/A                                 | Not applicable — no VPC on Cloudflare Workers.                                    |
| A31-04     | Low               | STILL OPEN    | `terraform/cloudflare/main.tf`       | No egress filtering. Future enhancement. Not addressed by PRs #694–#698.          |
| A31-05     | Info              | NOT APPLICABLE | `terraform/cloudflare/main.tf:38-68` | Tokens correctly scoped. No fix needed.                                           |
| A31-06     | Info              | NOT APPLICABLE | `terraform/cloudflare/main.tf`       | Logpush configured. No fix needed.                                                |

### [A34] CI/CD

| Finding ID | Original Severity | Status        | Evidence                                            | Notes                                                                                        |
| ---------- | ----------------- | ------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| A34-01     | Info              | NOT APPLICABLE | `.github/workflows/ci.yml:9-37`                    | Placeholder values. No fix needed.                                                           |
| A34-02     | Info              | NOT APPLICABLE | `terraform/github/branch-protection.tf`             | Ruleset compliant. No fix needed.                                                            |
| A34-03     | Info              | NOT APPLICABLE | `.github/workflows/ci.yml:47-49`                    | Pinned SHAs. No fix needed.                                                                  |
| A34-04     | Info              | NOT APPLICABLE | `.github/workflows/ci.yml`                          | SBOM generated. No fix needed.                                                               |
| A34-05     | Info              | NOT APPLICABLE | `.github/workflows/ci.yml`                          | Provenance signed. No fix needed.                                                            |
| A34-06     | Low               | NOT APPLICABLE | `.github/workflows/*.yml`                           | GitHub-hosted runners. No fix needed.                                                        |
| A34-07     | Info              | NOT APPLICABLE | `.github/workflows/ci.yml:8`                        | Least-privilege permissions. No fix needed.                                                  |
| A34-08     | Low               | STILL OPEN    | `preview.yml:19` (4.85.0) vs `deploy.yml:79` (4.93.1) | Wrangler version mismatch persists. Not addressed by PRs #694–#698.                      |

### [A35] Cloud IAM Least Privilege

| Finding ID | Original Severity | Status        | Evidence                                      | Notes                                                                                         |
| ---------- | ----------------- | ------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| A35-01     | Info              | NOT APPLICABLE | `terraform/cloudflare/main.tf:38-68`          | Five scoped tokens. No fix needed.                                                            |
| A35-02     | Info              | NOT APPLICABLE | `.github/workflows/deploy.yml:97`             | Scoped deploy token. No fix needed.                                                           |
| A35-03     | Info              | NOT APPLICABLE | `terraform/github/branch-protection.tf:50-60` | Break-glass compliant. No fix needed.                                                         |
| A35-04     | Low               | ACCEPTED RISK | `.github/workflows/deploy.yml`                | `SUPABASE_SERVICE_ROLE_KEY` full DB access. Document which routes use privileged client.       |

### [A36] Public Endpoint

All items assessed as compliant (A36-01 through A36-06). **No changes.** Status: **NOT APPLICABLE**.

### [A37] Storage Buckets (R2)

| Finding ID | Original Severity | Status        | Evidence                          | Notes                                                                          |
| ---------- | ----------------- | ------------- | --------------------------------- | ------------------------------------------------------------------------------ |
| A37-01     | Info              | NOT APPLICABLE | `wrangler.jsonc:69-72`           | Compliant. No fix needed.                                                      |
| A37-02     | Info              | ACCEPTED RISK | `wrangler.jsonc`                  | Platform-managed AES-256. No CMK available.                                    |
| A37-03     | Low               | STILL OPEN    | N/A                               | R2 versioning not yet GA. Monitor Cloudflare. Not addressed by PRs #694–#698.  |
| A37-04     | Info              | NOT APPLICABLE | `terraform/cloudflare/main.tf`    | Lifecycle managed. No fix needed.                                              |

### [A38] Secret Management

All items assessed as compliant (A38-01 through A38-05). **No changes.** Status: **NOT APPLICABLE**.

Note: A38-04 (rotation policy drill) — the recommendation to verify rotation is exercised remains a **STILL OPEN** operational recommendation.

### [A40] Monitoring, Alerting, SLOs, DR

| Finding ID | Original Severity | Status        | Evidence                                | Notes                                                                              |
| ---------- | ----------------- | ------------- | --------------------------------------- | ---------------------------------------------------------------------------------- |
| A40-01     | Info              | NOT APPLICABLE | `docs/slo-definitions.md`              | SLOs defined. No fix needed.                                                       |
| A40-02     | Info              | NOT APPLICABLE | `terraform/cloudflare/sentry-alerts.tf` | 9 alert rules. No fix needed.                                                      |
| A40-03     | Info              | NOT APPLICABLE | `docs/runbooks/`                        | 12 runbooks. No fix needed.                                                        |
| A40-04     | Info              | NOT APPLICABLE | `docs/DR-RUNBOOK.md`                    | DR plan exists. No fix needed.                                                     |
| A40-05     | Low               | STILL OPEN    | N/A                                     | No IaC-codified dashboards. Sentry is primary. Not addressed by PRs #694–#698.     |

### [A41] Observability Privacy

| Finding ID | Original Severity | Status        | Evidence                             | Notes                                                                                                     |
| ---------- | ----------------- | ------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| A41-01     | Info              | NOT APPLICABLE | `lib/get-client-ip.ts`              | HMAC fingerprint. No fix needed.                                                                          |
| A41-02     | Info              | NOT APPLICABLE | `app/api/track/click/route.ts:25-40` | No raw PII. No fix needed.                                                                                |
| A41-03     | Low               | FIXED          | `lib/logger.ts:80-83,146,175`        | PII redaction now includes `DENIED_LOG_FIELDS` (30+ fields), `PII_PATTERNS` regex matching, value-level email redaction, and IP truncation via `truncateIp()`. Originally flagged as missing; now present. |
| A41-04     | Info              | NOT APPLICABLE | N/A                                  | No high-cardinality metrics. No fix needed.                                                               |

### [A42] Autoscaling

All items assessed as compliant (A42-01 through A42-03). **No changes.** Status: **NOT APPLICABLE**.

### [A43] Cron/Scheduled Jobs

All items assessed as compliant (A43-01 through A43-05). **No changes.** Status: **NOT APPLICABLE**.

### [A44] Queue/Event Bus

All items assessed as compliant (A44-01 through A44-04). **No changes.** Status: **NOT APPLICABLE**.

### [A45] Deploy (Rollback, Feature Flags, Migrations)

| Finding ID | Original Severity | Status        | Evidence                                | Notes                                                                                                        |
| ---------- | ----------------- | ------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| A45-01     | Info              | NOT APPLICABLE | `.github/workflows/rollback.yml`       | Rollback workflow. No fix needed.                                                                            |
| A45-02     | Info              | NOT APPLICABLE | `lib/feature-flags.ts`                  | Registry with expiry. **PR #695** registered `LOGIN_RATE_LIMIT_GLOBAL_DISABLED` in `FLAG_REGISTRY` (`lib/feature-flags.ts:82-94`). |
| A45-03     | Info              | NOT APPLICABLE | `scripts/check-migrations.sh`           | Migration lint. No fix needed.                                                                               |
| A45-04     | Info              | NOT APPLICABLE | `.github/workflows/deploy-gradual.yml`  | Canary deploy. No fix needed.                                                                                |
| A45-05     | Low               | STILL OPEN    | N/A                                     | Kill-switch documentation recommended. Not addressed by PRs #694–#698.                                      |

### [A46] Per-Endpoint API Audit

| Finding ID | Original Severity | Status        | Evidence                                                   | Notes                                                                                                                  |
| ---------- | ----------------- | ------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| A46-01     | Info              | NOT APPLICABLE | `app/api/auth/*/route.ts`                                 | All auth endpoints rate-limited. No fix needed.                                                                        |
| A46-02     | Info              | NOT APPLICABLE | `app/api/admin/*/route.ts`                                | All admin routes gated. No fix needed.                                                                                 |
| A46-03     | Info              | NOT APPLICABLE | `app/api/track/*`, `app/api/newsletter/*`                  | Rate-limited, origin-validated. **PR #698** added i18n to newsletter confirmation emails.                              |
| A46-04     | Info              | NOT APPLICABLE | `app/api/cron/*/route.ts`                                 | All cron routes use `verifyCronAuth()`. **PR #694** added `captureException()` to 4 cron routes. **PR #695** added cron auth test. |
| A46-05     | Info              | NOT APPLICABLE | `app/api/internal/*`                                       | Gated by `INTERNAL_API_TOKEN` HMAC. No fix needed.                                                                     |
| A46-06     | Low               | STILL OPEN    | Various                                                    | No formal schema validation library (zod/joi) adopted. Manual `parseJsonBody()` with field checks persists. Not addressed by PRs #694–#698. |

### [A47] IDOR Per Endpoint

All items assessed as compliant (A47-01 through A47-03). **No changes.** Status: **NOT APPLICABLE**.

### [A48] Mass Assignment

| Finding ID | Original Severity | Status        | Evidence                               | Notes                                                                                        |
| ---------- | ----------------- | ------------- | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| A48-01     | Info              | NOT APPLICABLE | `app/api/admin/users/route.ts:61-64`  | Destructured allowlist. No fix needed.                                                       |
| A48-02     | Info              | NOT APPLICABLE | `app/api/admin/pages/[id]/route.ts:64` | Explicit field allowlist. No fix needed.                                                     |
| A48-03     | Low               | STILL OPEN    | `app/api/admin/products/route.ts`      | Product update body parsing needs deeper audit. Not addressed by PRs #694–#698.              |

### [A49] CORS

All items assessed as compliant (A49-01 through A49-04). **No changes.** Status: **NOT APPLICABLE**.

### [A50] SSRF

All items assessed as compliant (A50-01 through A50-05). **No changes.** Status: **NOT APPLICABLE**.

### [A51] Rate Limiting

All items assessed as compliant (A51-01 through A51-05). **No changes.** Note: **PR #695** increased LRU cap from 10K to 50K (`lib/rate-limit.ts:253-264`), improving capacity. Status: **NOT APPLICABLE** (all already compliant; LRU improvement is a bonus).

### [A52] File Upload

| Finding ID | Original Severity | Status        | Evidence                                 | Notes                                                                                     |
| ---------- | ----------------- | ------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| A52-01     | Info              | NOT APPLICABLE | `app/api/admin/upload/route.ts`         | Size limit enforced. No fix needed.                                                       |
| A52-02     | Info              | NOT APPLICABLE | `app/api/admin/upload/route.ts:17-23`    | Type allowlist. SVG excluded. No fix needed.                                              |
| A52-03     | Info              | NOT APPLICABLE | `app/api/admin/upload/route.ts`          | Server-side key generation. No fix needed.                                                |
| A52-04     | Low               | STILL OPEN    | N/A                                      | No AV scanning on uploads. Not addressed by PRs #694–#698.                                |
| A52-05     | Info              | NOT APPLICABLE | `app/api/admin/upload/finalize/route.ts` | Magic byte validation. No fix needed.                                                     |

### [A53] CSRF

All items assessed as compliant (A53-01 through A53-04). **No changes.** Status: **NOT APPLICABLE**.

### [A54] Cookies

All items assessed as compliant (A54-01 through A54-05). **No changes.** Status: **NOT APPLICABLE**.

### [A55] CSP

All items assessed as compliant (A55-01 through A55-06). **No changes.** Status: **NOT APPLICABLE**.

### [A56] Security Headers

All items assessed as compliant (A56-01 through A56-05). **No changes.** Status: **NOT APPLICABLE**.

### [A58] Frontend Untrusted-Data-to-DOM

All items assessed as compliant (A58-01 through A58-06). **No changes.** Status: **NOT APPLICABLE**.

### [A59] Client Route Guards

All items assessed as compliant (A59-01 through A59-04). **No changes.** Status: **NOT APPLICABLE**.

### [A60] Third-Party Scripts

All items assessed as compliant (A60-01 through A60-04). **No changes.** Status: **NOT APPLICABLE**.

---

## Regression Check — New Issues Introduced by PRs #694–#698

| ID    | Severity | Source | Location                              | Description                                                                                                                                                             | Recommended Fix                                                            |
| ----- | -------- | ------ | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| REG-1 | Low      | PR #698 | `app/api/newsletter/route.ts:281`    | Email **subject** line uses `t("newsletter.confirm_subject")` without passing `siteLocale`, so it always defaults to English even when the body is rendered in Arabic.   | Change to `t("newsletter.confirm_subject", siteLocale)`.                   |
| REG-2 | Info     | PR #696 | `app/api/user/data-export/route.ts`  | New GDPR data-export endpoint resolves `siteId` via `x-site-id` header. The header is HMAC-signed elsewhere in the middleware chain, but this route does not explicitly verify the HMAC signature — it relies on upstream middleware. | Verify that middleware HMAC verification covers this path; if not, add explicit verification. |

---

## Re-Run of Critical Audits (A1, A7, A16, A46)

### A1 — Taint-Flow (re-run)

Re-scanned all `dangerouslySetInnerHTML`, `sanitizeHtml`, `redirect()` calls, and untrusted input flows:
- **No new taint-flow vectors** introduced by PRs #694–#698.
- The new `/api/user/data-export` endpoint (PR #696) accepts `email` via query parameter, passes through `sanitizeEmailInput()` + `isValidEmail()` + `trim().toLowerCase()`. Output is JSON (no HTML rendering). **Safe.**
- The i18n changes (PR #698) pass translated strings into email HTML via `escapeHtml()`, `escapeAttribute()`, `safeHref()`. **Safe.**

### A7 — AuthN/AuthZ (re-run)

- **Session lifetime:** PR #695 adds absolute caps (`lib/auth-constants.ts:59-60`): regular admin 24h, super_admin 12h. Cookie `maxAge` uses `Math.min(JWT_EXPIRY, roleBasedCap)` at `app/api/auth/login/route.ts:514-521`. **Improvement confirmed.**
- **`authorizeResource` coverage:** Now 14 entity types (up from 5). Includes `scheduled_job`, `deal`, `quiz`, `drip_campaign`, `commission`, `membership`, `module`, `ai_draft`, `affiliate_network`. **A7-006 confirmed fixed.**
- **Cron auth:** `verifyCronAuth()` tested with correct/wrong/missing secrets (`__tests__/cron-auth.test.ts:130-158`). **A88-7 confirmed.**
- **Timing-safe compare:** Different-length token rejection tested (`__tests__/csrf.test.ts:46-49`). **A88-1 confirmed.**
- **Revoked token:** `verifyToken()` rejects revoked tokens when revocation is strict (`__tests__/api/auth/auth.test.ts:172-199`). **A88-2 confirmed.**

### A16 — Schema Review (re-run)

- **No schema changes** in PRs #694–#698 (no migration files modified).
- Existing schema constraints (PK UUIDs, NOT NULL, NUMERIC(12,2) for money, CHECK constraints, FKs, UNIQUE, indexes) remain intact.

### A46 — Per-Endpoint API Audit (re-run)

- **New endpoint:** `GET /api/user/data-export` (PR #696) — rate-limited (3/15min, fail-closed), input validated (`sanitizeEmailInput` + `isValidEmail`), site-scoped via `resolveDbSiteId`. Registered in `lib/api-route-metadata.ts`. **Properly secured.**
- **Modified endpoints:**
  - `app/api/cron/ai-generate/route.ts` — added cursor param for resumability (PR #696). Input validated (`Number.isFinite`). **Safe.**
  - `app/api/newsletter/route.ts` — i18n strings via `t()` (PR #698). All outputs through `escapeHtml`/`escapeAttribute`/`safeHref`. **Safe.**
- **Cron routes** — 4 routes now have `captureException()` (PR #694). Security posture unchanged (auth still via `verifyCronAuth`). **Improvement confirmed.**

---

## Summary

### Findings Addressed by PRs #694–#698

| Finding    | Severity | PR   | Status | Evidence                                                         |
| ---------- | -------- | ---- | ------ | ---------------------------------------------------------------- |
| A7-006     | Medium   | Pre-#694 | FIXED | `lib/authz.ts:147-162` — 14 resource types (was 5)           |
| A8-003     | Info     | #694 | FIXED  | `captureException` added to 4 cron routes                       |
| A41-03     | Low      | Pre-#694 | FIXED | `lib/logger.ts` — PII redaction layer now present             |

### Cross-Season Improvements from PRs #694–#698 (S3/S4 findings addressed)

| Finding (S3/S4)       | PR   | Evidence                                                                        |
| --------------------- | ---- | ------------------------------------------------------------------------------- |
| S4:A99-1 (LRU cap)    | #695 | `lib/rate-limit.ts:253-264` — 10K→50K, configurable                            |
| S4:A100-1 (session)   | #695 | `lib/auth-constants.ts:59-60`, `login/route.ts:506-521` — role-based session caps |
| S4:A88-1 (timing test) | #695 | `__tests__/csrf.test.ts:46-49`                                                  |
| S4:A88-2 (revocation) | #695 | `__tests__/api/auth/auth.test.ts:172-199`                                        |
| S4:A88-7 (cron auth)  | #695 | `__tests__/cron-auth.test.ts:130-158`                                            |
| S4:A90-1 (flag reg)   | #695 | `lib/feature-flags.ts:82-94`                                                     |
| S3:S3-004 (GDPR export) | #696 | `app/api/user/data-export/route.ts`                                            |
| S3:S3-008 (CCPA)      | #696 | `app/(public)/privacy/page.tsx:247-295`                                          |
| S3:S3-021 (consent)   | #696 | `cookie-consent-cmp.tsx:126,164,170` — `equalWeightButtons: true`, "Reject All" |
| S3:S3-034/060 (CB)    | #696 | `lib/supabase-circuit-breaker.ts`                                                |
| S3:S3-056 (cursor)    | #696 | `app/api/cron/ai-generate/route.ts:43-50`                                        |
| S4:A92-1/2 (i18n)     | #698 | `app/api/newsletter/route.ts:194-227`, `lib/i18n/index.ts`                       |

### Still-Open S1/S2 Findings (not addressed by PRs #694–#698)

| Finding  | Severity | Section | Description                                                   |
| -------- | -------- | ------- | ------------------------------------------------------------- |
| A9-004   | Low      | A9      | Use `~` pinning for `@supabase/supabase-js`, `stripe`        |
| A10-004  | Low      | A10     | KV rate-limit race — ensure DO binding in production          |
| A17-003  | Low      | A17     | Partial index for `missingUrl` filter                         |
| A18-003  | Low      | A18     | Cron publish batch non-transactional                          |
| A21-005  | Medium   | A21     | Admin emails stored in plaintext                              |
| A22-002  | Low      | A22     | No app-level backup beyond Supabase PITR                      |
| A27-004  | Low      | A27     | No partial indexes for soft-delete patterns                   |
| A31-01   | Low      | A31     | R2 buckets lack ownership tags                                |
| A31-04   | Low      | A31     | No egress filtering on Workers                                |
| A34-08   | Low      | A34     | Wrangler version mismatch (4.85.0 vs 4.93.1)                 |
| A37-03   | Low      | A37     | R2 versioning not GA                                          |
| A38-04   | Low      | A38     | Secret rotation drill unverified                              |
| A40-05   | Low      | A40     | No IaC-codified dashboards                                    |
| A45-05   | Low      | A45     | Kill-switch documentation missing                             |
| A46-06   | Low      | A46     | No formal schema validation library (zod/joi)                 |
| A48-03   | Low      | A48     | Product update body parsing needs audit                       |
| A52-04   | Low      | A52     | No AV scanning on uploads                                     |

### Regressions Introduced

| ID    | Severity | PR   | Description                                               | Fix                                          |
| ----- | -------- | ---- | --------------------------------------------------------- | -------------------------------------------- |
| REG-1 | Low      | #698 | Email subject not localized (missing `siteLocale` param)  | `t("newsletter.confirm_subject", siteLocale)` |
| REG-2 | Info     | #696 | Data-export route relies on middleware for x-site-id HMAC | Verify middleware coverage or add explicit check |

### Overall Assessment

**PRs #694–#698 successfully addressed their target findings** (Season 3 and Season 4). Their impact on Season 1/Season 2 findings is limited because most S1/S2 items were already compliant at audit time. The one Medium S1 finding that was fixed (A7-006 — `authorizeResource` expansion) was addressed by earlier PRs prior to #694.

**1 Medium finding remains open** (A21-005 — admin email plaintext storage), along with **16 Low findings** that are hardening recommendations rather than exploitable vulnerabilities. **1 Low regression** was identified in PR #698 (email subject not localized).

The codebase maintains its **mature security posture** with no new critical or high-severity issues introduced.
