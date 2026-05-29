# Season 10 — Compliance & Privacy Re-Audit

**Date:** 2026-05-29
**Auditor:** Devin (automated, code-verified)
**Scope:** Open compliance/privacy issues from prior audits
**Method:** Static code review against `main` branch at HEAD

---

## Summary

| #    | Issue                                                      | Verdict                            | Severity |
| ---- | ---------------------------------------------------------- | ---------------------------------- | -------- |
| #586 | Production alerting not wired — `alert_mechanisms` empty   | **VERIFIED**                       | CRITICAL |
| #588 | Silent cron job failures — no alerting for missed jobs     | **VERIFIED** (partially mitigated) | CRITICAL |
| #589 | DR drill workflows — verify PITR on dashboard              | **VERIFIED** (downgraded)          | MEDIUM   |
| #591 | R2 versioning in Terraform — verify actual bucket state    | **VERIFIED** (downgraded)          | MEDIUM   |
| #593 | Global coverage at 24% — risk-weighted coverage adequate   | **VERIFIED** (downgraded)          | HIGH     |
| #594 | TOTP encryption key has no rotation mechanism              | **ALREADY FIXED**                  | —        |
| #600 | R2 buckets default to WNAM — EU→US data transfer           | **VERIFIED**                       | HIGH     |
| #601 | No CSAM/illegal-content hash matching for UGC images       | **VERIFIED**                       | HIGH     |
| #602 | AI content disclosure is machine-only — no human label     | **VERIFIED**                       | HIGH     |
| #603 | No self-service DSAR portal — admin-mediated only          | **VERIFIED**                       | HIGH     |
| #604 | bcrypt 72-byte truncation — policy/implementation mismatch | **VERIFIED**                       | HIGH     |

**Totals:** 9 VERIFIED, 1 ALREADY FIXED, 0 FALSE POSITIVE

---

## Detailed Findings

### #586 — Production alerting not wired (VERIFIED)

**Files reviewed:** `terraform/cloudflare/alerts.tf:38-48`, `terraform/cloudflare/production.tfvars.example`

`alert_mechanisms` variable defaults to empty lists for all three channels
(email, pagerduty, webhooks). `alerts_enabled` defaults to `true` and a
lifecycle precondition blocks apply with empty mechanisms, but the example
tfvars does not populate any destinations. SLO burn-rate alerts exist in HCL
but cannot fire until operators supply real Cloudflare notification destination IDs.

---

### #588 — Silent cron job failures (VERIFIED — partially mitigated)

**Files reviewed:** `workers/custom-worker.ts:70-113`, `lib/cron-liveness.ts`

**Fixed:**

- The `!cronHost` path (line 70-78) now **throws** — captured by the
  `withSentry` wrapper at line 356+.
- `lib/cron-liveness.ts` implements a KV-based heartbeat system that records
  last-successful-run timestamps and detects missed schedules via structured
  `cron_liveness_miss` logs.

**Still open:**

- The `!job` path (unknown schedule, line 85-91): `console.error` + `return` —
  no throw, no `captureException`. Sentry will not capture this.
- The `!cronSecret` path (missing secret, line 107-113): `console.error` +
  `return` — no throw, no `captureException`. Sentry will not capture this.
- Cron-liveness log alerting depends on Logpush → Sentry pipeline, which
  depends on #586 (alert_mechanisms) being resolved.

---

### #589 — DR drill workflows (VERIFIED — downgraded)

**Files reviewed:** `.github/workflows/dr-drill.yml`, `.github/workflows/backup-restore-drill.yml`

Both workflows exist and are functional (`workflow_dispatch` trigger against
staging). The remaining action — verifying PITR is enabled on the Supabase
dashboard — cannot be confirmed from code. Issue status (MEDIUM, dashboard
verification task) is accurate.

---

### #591 — R2 versioning in Terraform (VERIFIED — downgraded)

**Files reviewed:** `terraform/cloudflare/storage.tf`

Terraform intent is present: `lifecycle { prevent_destroy = true }`, versioning
comments, `r2_worm_enabled = true` default, and `r2_bucket_hardening`
null_resource running post-create API calls. Actual bucket state must be
verified via Cloudflare dashboard/API. Issue status (MEDIUM) is accurate.

---

### #593 — Global coverage at 24% (VERIFIED — downgraded)

**Files reviewed:** `vitest.config.ts` (coverage thresholds), `package.json` (stryker)

Global thresholds recently ratcheted to 24/20/20/24 (from 23/19/19/23) on
2026-05-29. Per-directory gates cover critical paths: `lib/auth*` 50%,
`lib/rate-limit*` 72%, `lib/quotas*` 80%, `lib/stripe-webhook*` 80%,
`lib/ai/**` 53%. Stryker mutation testing is configured. Risk-weighted
coverage is adequate; global 40% target within 90 days is correct.

---

### #594 — TOTP encryption key rotation (ALREADY FIXED)

**Files reviewed:** `lib/totp-encryption.ts`

Versioned envelope encryption now implemented:

- `enc:v1:` prefix uses `TOTP_ENCRYPTION_KEY`
- `enc:v2:` prefix uses `TOTP_ENCRYPTION_KEY_V2`
- HKDF derivation uses version-specific salt
- New encryptions use latest available version
- Decryption supports both versions concurrently
- Production fails-closed if no key is set

This implements Option A (rotation window) from the original issue.

---

### #600 — R2 buckets default to WNAM (VERIFIED)

**Files reviewed:** `terraform/cloudflare/storage.tf:13-16`, `terraform/cloudflare/production.tfvars.example`, `docs/data-residency.md:16`

- `r2_default_location` defaults to `"WNAM"` in both `storage.tf` and the
  example tfvars
- `docs/data-residency.md:16` claims R2 is "Auto (nearest region)" —
  contradicts Terraform config
- Both R2 buckets use `location = var.r2_default_location` → WNAM
- Supabase DB is in `eu-central-1` (Frankfurt) — confirmed EU→US split

---

### #601 — No CSAM hash matching for UGC images (VERIFIED)

**Files reviewed:** `lib/ai/content-moderation.ts:27-50`, `app/api/community/wrist-shots/route.ts`, `app/api/admin/upload/route.ts`

Content moderation is **text-only** (regex patterns at line 34-35). No
perceptual hash scanning (PhotoDNA, Cloudflare CSAM scanning, AWS Rekognition)
exists. Wrist-shot and admin image uploads rely solely on manual moderation.

---

### #602 — AI content disclosure is machine-only (VERIFIED)

**Files reviewed:** `lib/ai/content-generator.ts:162-170`, `app/(public)/[contentType]/[slug]/page.tsx:78-80`

- `content-generator.ts:170`: `<div data-ai-generated="true">` — invisible
- `page.tsx:80`: `<meta name="ai-generated">` — invisible
- No visible disclosure banner/component exists in any `.tsx` file
- The `ai_generated` DB column exists but is only used for meta tags

EU AI Act Art. 50(2) requires human-detectable marking. Current implementation
satisfies machine-readability only.

---

### #603 — No self-service DSAR portal (VERIFIED)

**Files reviewed:** `app/api/admin/privacy/user/route.ts:28-34`, `app/api/admin/privacy/rectify/route.ts`, `app/api/admin/privacy/restrict/route.ts`, `app/api/admin/privacy/object/route.ts`

All four privacy endpoints require admin authentication (`withAuthz` +
`super_admin` role check). No public-facing DSAR endpoint exists. Data subject
requests for access/deletion/rectification require super_admin manual
processing.

---

### #604 — bcrypt 72-byte policy/implementation mismatch (VERIFIED)

**Files reviewed:** `lib/password.ts:99-103,128-129`, `lib/password-policy.ts:14-22`

- `password-policy.ts:22`: `MAX_LENGTH = 128` (character-based)
- `password.ts:100`: rejects `> 72` bytes with thrown error
- `password.ts:128`: silently returns `{ valid: false }` for `> 72` bytes
- A 40-character CJK/emoji password passes the 128-char policy check but
  fails at the 72-byte hashing layer

No pre-hash pattern (`bcrypt(SHA-256(password))`) is implemented. The 72-byte
guard prevents silent truncation (good), but the UX gap between the policy
layer and the hashing layer is confirmed.

---

## Documents Reviewed

- `docs/ropa.md` — Record of Processing Activities (complete, accurate)
- `docs/data-residency.md` — Contains R2 location inconsistency (see #600)
- `lib/auth.ts` — bcrypt timing equalization, dummy hash, JWT handling (sound)
- `lib/password.ts` — bcrypt + legacy PBKDF2 support (72-byte guard present)
- `lib/ai/content-generator.ts` — AI watermark (machine-only)
- `lib/ai/content-moderation.ts` — Text-only moderation (no image hashing)
- `lib/totp-encryption.ts` — Versioned envelope encryption (rotation fixed)
- `lib/cron-liveness.ts` — KV heartbeat system (present but depends on #586)
- `app/api/admin/privacy/*` — GDPR endpoints (admin-only, no public DSAR)
- `terraform/cloudflare/alerts.tf` — SLO alerts (mechanisms empty)
- `terraform/cloudflare/storage.tf` — R2 config (WNAM default)
