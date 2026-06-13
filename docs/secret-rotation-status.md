# Secret Rotation Status

> **Due Diligence Artifact (E2-11)**
> **Last Updated:** 2026-06-12
> **Purpose:** Document secret-rotation runbook, cadence, and automation status for due diligence

## Overview

Secret rotation procedures are documented in `docs/secrets-rotation-runbook.md` with step-by-step instructions for each secret. The policy is defined in `docs/secret-rotation-policy.md` with cadence and ownership.

---

## Rotation Cadence Summary

| Secret Category          | Cadence                | Status        |
| ------------------------ | ---------------------- | ------------- |
| **JWT Secrets**          | 90 days                | ✅ Documented |
| **Supabase Keys**        | 90 days                | ✅ Documented |
| **Cron Secrets**         | 90 days                | ✅ Documented |
| **Stripe Keys**          | 90 days                | ✅ Documented |
| **Internal API**         | 90 days                | ✅ Documented |
| **TOTP Encryption**      | 180 days               | ✅ Documented |
| **Click Cache HMAC**     | 90 days                | ✅ Documented |
| **GDPR Hash**            | Rare (compromise only) | ✅ Documented |
| **R2 Keys**              | 180 days               | ✅ Documented |
| **Cloudflare API Token** | 180 days               | ✅ Documented |
| **Turnstile Keys**       | 180 days               | ✅ Documented |
| **Resend API Key**       | 180 days               | ✅ Documented |
| **Sentry DSN**           | Rare (compromise only) | ✅ Documented |
| **AI Provider Keys**     | 180 days               | ✅ Documented |

---

## Detailed Secret Inventory

### Core Authentication Secrets

| Secret                                                      | Cadence  | Owner Module                        | Blast Radius                                                            | Procedure                         |
| ----------------------------------------------------------- | -------- | ----------------------------------- | ----------------------------------------------------------------------- | --------------------------------- |
| `JWT_SECRET` / `JWT_SECRET_CURRENT` / `JWT_SECRET_PREVIOUS` | 90 days  | `lib/auth.ts` + `lib/jwt-secret.ts` | All admin sessions invalidated (single-key) or zero-downtime (dual-key) | `secrets-rotation-runbook.md` §1  |
| `SUPABASE_SERVICE_ROLE_KEY`                                 | 90 days  | `lib/server-only/*`                 | All DB writes fail (RLS bypass disabled)                                | `secrets-rotation-runbook.md` §2  |
| `SUPABASE_JWT_SECRET`                                       | 90 days  | `lib/supabase-server.ts`            | RLS JWT signing fails                                                   | `secrets-rotation-runbook.md` §2  |
| `INTERNAL_API_TOKEN`                                        | 90 days  | `lib/internal-auth.ts`              | Internal middleware ↔ API calls fail (HMAC strict)                      | `secrets-rotation-runbook.md` §3  |
| `TOTP_ENCRYPTION_KEY` (+ `_V`)                              | 180 days | `lib/totp.ts`                       | All TOTP shared secrets at rest unreadable until re-enrolled            | `secrets-rotation-runbook.md` §3a |

### Cron Secrets (11 per-trigger + 1 shared)

| Secret                           | Cadence | Owner Module                         | Blast Radius                      | Procedure                        |
| -------------------------------- | ------- | ------------------------------------ | --------------------------------- | -------------------------------- |
| `CRON_SECRET` (shared fallback)  | 90 days | `lib/cron-auth.ts`                   | All cron jobs fail until deployed | `secrets-rotation-runbook.md` §3 |
| `CRON_PUBLISH_SECRET`            | 90 days | `/api/cron/publish`                  | Publishing cron fails             | `secrets-rotation-runbook.md` §3 |
| `CRON_STRIPE_SYNC_SECRET`        | 90 days | `/api/cron/stripe-sync`              | Stripe sync cron fails            | `secrets-rotation-runbook.md` §3 |
| `CRON_AI_SECRET`                 | 90 days | `/api/cron/ai-generate`              | AI generation cron fails          | `secrets-rotation-runbook.md` §3 |
| `CRON_SITEMAP_SECRET`            | 90 days | `/api/cron/sitemap-refresh`          | Sitemap refresh cron fails        | `secrets-rotation-runbook.md` §3 |
| `CRON_RETENTION_SECRET`          | 90 days | `/api/cron/data-retention`           | Data retention cron fails         | `secrets-rotation-runbook.md` §3 |
| `CRON_COMMISSION_SECRET`         | 90 days | `/api/cron/commission-ingest`        | Commission ingest cron fails      | `secrets-rotation-runbook.md` §3 |
| `CRON_EPC_SECRET`                | 90 days | `/api/cron/epc-recompute`            | EPC recompute cron fails          | `secrets-rotation-runbook.md` §3 |
| `CRON_PRICE_SECRET`              | 90 days | `/api/cron/price-scrape`             | Price scrape cron fails           | `secrets-rotation-runbook.md` §3 |
| `CRON_DEALS_SECRET`              | 90 days | `/api/cron/expire-deals`             | Deals expiry cron fails           | `secrets-rotation-runbook.md` §3 |
| `CRON_CLICK_RECONCILE_SECRET`    | 90 days | `/api/cron/click-reconcile`          | Click reconcile cron fails        | `secrets-rotation-runbook.md` §3 |
| `CRON_ACCESS_REVIEW_SECRET`      | 90 days | `/api/cron/access-review`            | Access review cron fails          | `secrets-rotation-runbook.md` §3 |
| `CRON_HOMEPAGE_SYNTHETIC_SECRET` | 90 days | `/api/cron/homepage-synthetic-check` | Homepage synthetic check fails    | `secrets-rotation-runbook.md` §3 |

### Integrity & Hashing Secrets

| Secret                 | Cadence                | Owner Module                   | Blast Radius                                                                   | Procedure                         |
| ---------------------- | ---------------------- | ------------------------------ | ------------------------------------------------------------------------------ | --------------------------------- |
| `CLICK_CACHE_HMAC_KEY` | 90 days                | `app/api/track/click/route.ts` | Click-cache integrity drops to best-effort; cached entries reject after rotate | `secrets-rotation-runbook.md` §3b |
| `GDPR_HASH_SECRET`     | Rare (compromise only) | `lib/gdpr-hash.ts`             | PII hashing falls back **closed** (throws) — analytics writers block           | `secrets-rotation-runbook.md` §3b |

**Note:** `GDPR_HASH_SECRET` rotation is destructive — old hashes will not match new hashes, so any de-duplication/lookup keyed on these hashes resets. Only rotate when compromised or when a privacy review explicitly requires it.

### Third-Party Service Secrets

| Secret                                      | Cadence                | Owner Module                           | Blast Radius                                    | Procedure                         |
| ------------------------------------------- | ---------------------- | -------------------------------------- | ----------------------------------------------- | --------------------------------- |
| `STRIPE_SECRET_KEY`                         | 90 days                | `app/api/membership/checkout/route.ts` | Checkout + subscription sync fail until updated | `secrets-rotation-runbook.md` §8  |
| `STRIPE_WEBHOOK_SECRET`                     | 90 days                | `app/api/membership/webhook/route.ts`  | Stripe webhooks return `400` until updated      | `secrets-rotation-runbook.md` §9  |
| `RESEND_API_KEY`                            | 180 days               | `app/api/newsletter/`                  | Email sending fails until updated               | `secrets-rotation-runbook.md` §4  |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | 180 days               | `lib/r2.ts`                            | Image uploads fail until updated                | `secrets-rotation-runbook.md` §5  |
| `CLOUDFLARE_API_TOKEN`                      | 180 days               | CI/CD only                             | Deployments fail until updated                  | `secrets-rotation-runbook.md` §6  |
| `TURNSTILE_SECRET_KEY`                      | 180 days               | `lib/turnstile.ts`                     | Captcha verification fails until updated        | `secrets-rotation-runbook.md` §7  |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`     | Rare (compromise only) | `lib/sentry.ts`                        | Error monitoring temporarily disabled           | `secrets-rotation-runbook.md` §10 |
| `SENTRY_AUTH_TOKEN`                         | 180 days               | CI only                                | Source-map upload + release creation fail in CI | `secrets-rotation-runbook.md` §11 |

### AI Provider Secrets

| Secret                    | Cadence  | Owner Module | Blast Radius                                          | Procedure                         |
| ------------------------- | -------- | ------------ | ----------------------------------------------------- | --------------------------------- |
| `GEMINI_API_KEY`          | 180 days | `lib/ai/`    | Gemini skipped in fallback chain until updated        | `secrets-rotation-runbook.md` §12 |
| `GROQ_API_KEY`            | 180 days | `lib/ai/`    | Groq skipped in fallback chain until updated          | `secrets-rotation-runbook.md` §12 |
| `COHERE_API_KEY`          | 180 days | `lib/ai/`    | Cohere skipped in fallback chain until updated        | `secrets-rotation-runbook.md` §12 |
| `CLOUDFLARE_AI_API_TOKEN` | 180 days | `lib/ai/`    | Cloudflare AI skipped in fallback chain until updated | `secrets-rotation-runbook.md` §12 |

---

## Automation Status

| Aspect                  | Status             | Notes                                                                             |
| ----------------------- | ------------------ | --------------------------------------------------------------------------------- |
| **Rotation Procedures** | ✅ Documented      | Step-by-step procedures for all secrets in `docs/secrets-rotation-runbook.md`     |
| **Cadence Policy**      | ✅ Documented      | 90-day and 180-day cadences defined in `docs/secret-rotation-policy.md`           |
| **Automation**          | ❌ Manual          | No automated rotation scheduling or execution                                     |
| **Rotation Log**        | ❌ Not Implemented | No centralized log of rotation dates and actors                                   |
| **Expiration Alerts**   | ❌ Not Implemented | No automated alerts for upcoming rotation due dates                               |
| **Compliance Mapping**  | ✅ Documented      | SOC 2 and GDPR compliance requirements mapped in `docs/secret-rotation-policy.md` |

---

## Blind Spots (Information Not Available in Codebase)

The following secret-rotation information is not documented in the codebase and must be obtained from operational records:

- **Last rotation dates** for each secret - No rotation log exists
- **Rotation schedule** - No calendar or automation for scheduled rotations
- **Secret age tracking** - No mechanism to track how long secrets have been in use
- **Access audit logs** - No record of who accessed which secrets and when
- **Rotation verification** - No automated verification that rotations succeeded
- **Break-glass access logs** - No record of emergency secret access events
- **Secret compromise incidents** - No log of past secret compromise events and responses

---

## Required Actions

1. **Implement rotation logging** - Create a centralized log in `docs/pre-launch.md` or a dedicated rotation log file
2. **Schedule first rotation** - Establish baseline rotation dates for all 90-day and 180-day secrets
3. **Set up expiration alerts** - Configure PagerDuty or similar to alert before secrets expire
4. **Automate rotation** - Consider automating rotation for non-critical secrets (e.g., AI provider keys)
5. **Document last rotation dates** - Record when each secret was last rotated (if known)
6. **Implement access logging** - Log all secret access events (Cloudflare Workers audit log, GitHub Secrets access)
7. **Create rotation calendar** - Establish a recurring calendar event for secret rotation reviews

---

## Compliance Mapping

| Standard     | Requirement                | Status                                                                     |
| ------------ | -------------------------- | -------------------------------------------------------------------------- |
| SOC 2 CC6.1  | 90-day rotation            | ✅ Cadence defined, but not automated                                      |
| SOC 2 CC6.2  | Break-glass logging        | ⚠️ Partial - GitHub audit log exists, but no dedicated break-glass logging |
| SOC 2 CC7.2  | Secret compromise response | ✅ Emergency rotation procedure documented                                 |
| GDPR Art. 32 | Encryption key rotation    | ✅ JWT_SECRET rotation procedure documented                                |

---

## References

- `docs/secrets-rotation-runbook.md` - Step-by-step rotation procedures for all secrets
- `docs/secret-rotation-policy.md` - Secret lifecycle management policy (A38)
- `docs/secrets-rotation.md` - OF-34 short summary of rotation cadence
- `.env.example` - Complete environment variable reference
- `docs/CLOUDFLARE.md` - Cloudflare configuration and bindings
