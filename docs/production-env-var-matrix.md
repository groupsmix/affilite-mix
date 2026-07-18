# Production Environment Variable Matrix

> **Due Diligence Artifact**
> **Last Updated:** 2026-06-12
> **Purpose:** Document production environment variable configuration (names + status, not values)

## Legend

- ✅ **Set in Production** - Variable is configured in production (value not disclosed)
- ⚠️ **Optional** - Variable is optional for production operation
- ❌ **Not Set** - Variable is not set in production
- 🔒 **Secret** - Variable is stored as a Worker secret (via `wrangler secret put`)
- 🌐 **Public** - Variable is client-facing (inlined at build time via `NEXT_PUBLIC_*`)

---

## Required - Supabase

| Variable                        | Production Status | Type      | Source                            |
| ------------------------------- | ----------------- | --------- | --------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | ✅ Set            | 🌐 Public | Supabase Dashboard                |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ Set            | 🌐 Public | Supabase Dashboard                |
| `SUPABASE_SERVICE_ROLE_KEY`     | ✅ Set            | 🔒 Secret | Supabase Dashboard                |
| `SUPABASE_JWT_SECRET`           | ✅ Set            | 🔒 Secret | Supabase Dashboard (JWT Settings) |

---

## Required - Auth

| Variable                                | Production Status | Type      | Source                                                                                                                                                                      |
| --------------------------------------- | ----------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JWT_SECRET`                            | ✅ Set            | 🔒 Secret | Generated (`openssl rand -hex 64`)                                                                                                                                          |
| `JWT_SECRET_CURRENT`                    | ⚠️ Optional       | 🔒 Secret | Used during key rotation                                                                                                                                                    |
| `JWT_SECRET_PREVIOUS`                   | ⚠️ Optional       | 🔒 Secret | Used during key rotation (24h window)                                                                                                                                       |
| `JWT_ROTATION_STARTED_AT`               | ⚠️ Optional       | 🔒 Secret | ISO-8601 timestamp of rotation start                                                                                                                                        |
| `ADMIN_SESSION_STRICT`                  | ✅ Set            | 🔒 Secret | Admin session hardening umbrella                                                                                                                                            |
| `ADMIN_SESSION_TOKEN_REVOCATION_STRICT` | ✅ Set (`true`)   | 🔒 Secret | Deep-audit B3: fail-closed on KV outage. Does NOT inherit the umbrella for fail-closed — must be set explicitly. `false` is break-glass only (`docs/runbooks/kv-outage.md`) |
| `ADMIN_SESSION_BINDING_STRICT`          | ⚠️ Optional       | 🔒 Secret | Inherits from umbrella if unset                                                                                                                                             |
| `ADMIN_SESSION_IDLE_STRICT`             | ⚠️ Optional       | 🔒 Secret | Inherits from umbrella if unset                                                                                                                                             |

---

## Required - Internal API

| Variable                       | Production Status | Type      | Source                             |
| ------------------------------ | ----------------- | --------- | ---------------------------------- |
| `INTERNAL_API_TOKEN`           | ✅ Set            | 🔒 Secret | Generated (`openssl rand -hex 64`) |
| `INTERNAL_HMAC_MIGRATION_MODE` | ✅ Set            | 🔒 Secret | Set to `strict` in production      |

---

## Required - Cron Jobs

| Variable                             | Production Status | Type      | Source                               |
| ------------------------------------ | ----------------- | --------- | ------------------------------------ |
| `CRON_SECRET`                        | ✅ Set            | 🔒 Secret | Generated (shared fallback)          |
| `CRON_PUBLISH_SECRET`                | ⚠️ Optional       | 🔒 Secret | Per-trigger secret                   |
| `CRON_STRIPE_SYNC_SECRET`            | ⚠️ Optional       | 🔒 Secret | Per-trigger secret                   |
| `CRON_AI_SECRET`                     | ⚠️ Optional       | 🔒 Secret | Per-trigger secret                   |
| `CRON_SITEMAP_SECRET`                | ⚠️ Optional       | 🔒 Secret | Per-trigger secret                   |
| `CRON_RETENTION_SECRET`              | ⚠️ Optional       | 🔒 Secret | Per-trigger secret                   |
| `CRON_COMMISSION_SECRET`             | ⚠️ Optional       | 🔒 Secret | Per-trigger secret                   |
| `CRON_EPC_SECRET`                    | ⚠️ Optional       | 🔒 Secret | Per-trigger secret                   |
| `CRON_PRICE_SECRET`                  | ⚠️ Optional       | 🔒 Secret | Per-trigger secret                   |
| `CRON_DEALS_SECRET`                  | ⚠️ Optional       | 🔒 Secret | Per-trigger secret                   |
| `CRON_CLICK_RECONCILE_SECRET`        | ⚠️ Optional       | 🔒 Secret | Per-trigger secret                   |
| `CRON_ACCESS_REVIEW_SECRET`          | ⚠️ Optional       | 🔒 Secret | Per-trigger secret                   |
| `CRON_HOMEPAGE_SYNTHETIC_SECRET`     | ⚠️ Optional       | 🔒 Secret | Per-trigger secret                   |
| `CRON_ALLOW_SHARED_FALLBACK_IN_PROD` | ❌ Not Set        | 🔒 Secret | Escape hatch (unset in steady-state) |
| `HEALTH_DETAIL_BEARER`               | ⚠️ Optional       | 🔒 Secret | Dedicated health probe secret        |

---

## Required - URLs

| Variable    | Production Status | Type      | Source              |
| ----------- | ----------------- | --------- | ------------------- |
| `CRON_HOST` | ✅ Set            | 🔒 Secret | Primary site domain |
| `APP_URL`   | ✅ Set            | 🔒 Secret | Canonical app URL   |

---

## Required - Encryption

| Variable                 | Production Status | Type      | Source                             |
| ------------------------ | ----------------- | --------- | ---------------------------------- |
| `TOTP_ENCRYPTION_KEY`    | ✅ Set            | 🔒 Secret | Generated (`openssl rand -hex 32`) |
| `TOTP_ENCRYPTION_KEY_V2` | ⚠️ Optional       | 🔒 Secret | AES-256 key for 2FA                |
| `CLICK_CACHE_HMAC_KEY`   | ✅ Set            | 🔒 Secret | Dedicated HMAC for click cache     |

---

## Optional - Email (Resend)

| Variable                | Production Status | Type      | Source                  |
| ----------------------- | ----------------- | --------- | ----------------------- |
| `RESEND_API_KEY`        | ⚠️ Optional       | 🔒 Secret | Resend Dashboard        |
| `NEWSLETTER_FROM_EMAIL` | ⚠️ Optional       | 🔒 Secret | Verified sender address |

---

## Optional - Image Storage (R2)

| Variable               | Production Status | Type      | Source                       |
| ---------------------- | ----------------- | --------- | ---------------------------- |
| `R2_ACCOUNT_ID`        | ⚠️ Optional       | 🔒 Secret | Cloudflare Dashboard         |
| `R2_ACCESS_KEY_ID`     | ⚠️ Optional       | 🔒 Secret | Cloudflare R2 API Token      |
| `R2_SECRET_ACCESS_KEY` | ⚠️ Optional       | 🔒 Secret | Cloudflare R2 API Token      |
| `R2_BUCKET_NAME`       | ⚠️ Optional       | 🔒 Secret | Configured in wrangler.jsonc |
| `R2_PUBLIC_URL`        | ⚠️ Optional       | 🔒 Secret | R2 public URL                |

---

## Optional - CAPTCHA (Turnstile)

| Variable                           | Production Status | Type      | Source                             |
| ---------------------------------- | ----------------- | --------- | ---------------------------------- |
| `ENABLE_TURNSTILE`                 | ✅ Set            | 🔒 Secret | Set to `true` in production        |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`   | ✅ Set            | 🌐 Public | Cloudflare Dashboard               |
| `TURNSTILE_SECRET_KEY`             | ✅ Set            | 🔒 Secret | Cloudflare Dashboard               |
| `ALLOW_TURNSTILE_DISABLED_IN_PROD` | ❌ Not Set        | 🔒 Secret | Escape hatch (unset in production) |

---

## Optional - Paid Memberships (Stripe)

| Variable                  | Production Status | Type      | Source                      |
| ------------------------- | ----------------- | --------- | --------------------------- |
| `STRIPE_SECRET_KEY`       | ⚠️ Optional       | 🔒 Secret | Stripe Dashboard            |
| `STRIPE_WEBHOOK_SECRET`   | ⚠️ Optional       | 🔒 Secret | Stripe Dashboard            |
| `STRIPE_PRICE_MAP`        | ⚠️ Optional       | 🔒 Secret | JSON map of tier → price ID |
| `STRIPE_PRICE_ID_INSIDER` | ⚠️ Optional       | 🔒 Secret | Legacy per-tier var         |
| `STRIPE_PRICE_ID_PRO`     | ⚠️ Optional       | 🔒 Secret | Legacy per-tier var         |

---

## Required - Error Monitoring (Sentry)

| Variable                 | Production Status | Type      | Source           |
| ------------------------ | ----------------- | --------- | ---------------- |
| `SENTRY_DSN`             | ✅ Set            | 🔒 Secret | Sentry Dashboard |
| `NEXT_PUBLIC_SENTRY_DSN` | ✅ Set            | 🌐 Public | Sentry Dashboard |

**Sentry Status:** ✅ **Enabled in Production** - Both server and client DSNs are configured

---

## Optional - Cloudflare API

| Variable                | Production Status | Type      | Source                              |
| ----------------------- | ----------------- | --------- | ----------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | ⚠️ Optional       | 🔒 Secret | Cloudflare Dashboard (scoped token) |
| `CLOUDFLARE_ZONE_ID`    | ⚠️ Optional       | 🔒 Secret | Cloudflare Dashboard                |
| `CLOUDFLARE_ACCOUNT_ID` | ⚠️ Optional       | 🔒 Secret | Cloudflare Dashboard                |

---

## Optional - AI Content Engine

| Variable                  | Production Status | Type      | Source                          |
| ------------------------- | ----------------- | --------- | ------------------------------- |
| `CLOUDFLARE_AI_API_TOKEN` | ⚠️ Optional       | 🔒 Secret | Cloudflare Dashboard            |
| `GEMINI_API_KEY`          | ⚠️ Optional       | 🔒 Secret | Google AI Studio                |
| `GROQ_API_KEY`            | ⚠️ Optional       | 🔒 Secret | Groq Dashboard                  |
| `COHERE_API_KEY`          | ⚠️ Optional       | 🔒 Secret | Cohere Dashboard                |
| `AI_ENABLE_CLOUDFLARE`    | ⚠️ Optional       | 🔒 Secret | Provider enable flag            |
| `AI_ENABLE_GEMINI`        | ⚠️ Optional       | 🔒 Secret | Provider enable flag            |
| `AI_ENABLE_GROQ`          | ⚠️ Optional       | 🔒 Secret | Provider enable flag            |
| `AI_ENABLE_COHERE`        | ⚠️ Optional       | 🔒 Secret | Provider enable flag            |
| `AI_MAX_PROMPT_CHARS`     | ⚠️ Optional       | 🔒 Secret | Prompt ceiling (default: 16000) |

---

## Optional - Per-Tenant Quotas

| Variable                                    | Production Status | Type      | Source         |
| ------------------------------------------- | ----------------- | --------- | -------------- |
| `QUOTA_DEFAULT_AI_TOKENS_PER_MONTH`         | ⚠️ Optional       | 🔒 Secret | Global default |
| `QUOTA_DEFAULT_AI_COST_MICRO_USD_PER_MONTH` | ⚠️ Optional       | 🔒 Secret | Global default |
| `QUOTA_DEFAULT_AI_REQUESTS_PER_DAY`         | ⚠️ Optional       | 🔒 Secret | Global default |
| `QUOTA_DEFAULT_R2_STORAGE_BYTES`            | ⚠️ Optional       | 🔒 Secret | Global default |
| `QUOTA_DEFAULT_R2_EGRESS_BYTES_PER_MONTH`   | ⚠️ Optional       | 🔒 Secret | Global default |

---

## Optional - Affiliate Networks

| Variable                       | Production Status | Type      | Source                        |
| ------------------------------ | ----------------- | --------- | ----------------------------- |
| `CJ_API_KEY`                   | ⚠️ Optional       | 🔒 Secret | Commission Junction           |
| `CJ_PUBLISHER_ID`              | ⚠️ Optional       | 🔒 Secret | Commission Junction           |
| `PARTNERSTACK_API_KEY`         | ⚠️ Optional       | 🔒 Secret | PartnerStack                  |
| `ADMITAD_API_KEY`              | ⚠️ Optional       | 🔒 Secret | Admitad                       |
| `ADMITAD_PUBLISHER_ID`         | ⚠️ Optional       | 🔒 Secret | Admitad                       |
| `AFFILIATE_ALLOWED_DOMAINS`    | ⚠️ Optional       | 🔒 Secret | Domain allow-list             |
| `AFFILIATE_DOMAIN_ENFORCEMENT` | ✅ Set            | 🔒 Secret | Set to `strict` in production |

---

## Optional - Security

| Variable                     | Production Status | Type      | Source                              |
| ---------------------------- | ----------------- | --------- | ----------------------------------- |
| `GDPR_HASH_SECRET`           | ⚠️ Optional       | 🔒 Secret | HMAC key for GDPR exports           |
| `RATE_LIMIT_FORCE_CLOSED`    | ❌ Not Set        | 🔒 Secret | Kill-switch (unset in steady-state) |
| `RATE_LIMIT_KV_GRACE_MS`     | ⚠️ Optional       | 🔒 Secret | KV outage grace window              |
| `OUTBOUND_ALLOWED_HOSTNAMES` | ⚠️ Optional       | 🔒 Secret | SSRF allow-list                     |

---

## Optional - Observability

| Variable              | Production Status | Type      | Source                               |
| --------------------- | ----------------- | --------- | ------------------------------------ |
| `OTEL_ENDPOINT`       | ⚠️ Optional       | 🔒 Secret | OTLP/HTTP collector endpoint         |
| `OTEL_AUTH_TOKEN`     | ⚠️ Optional       | 🔒 Secret | OTEL authentication token            |
| `LOG_SHIPPER_ENABLED` | ⚠️ Optional       | 🌐 Public | GitHub Actions variable (not secret) |

---

## Optional - Operational Flags

| Variable                           | Production Status | Type      | Source                                   |
| ---------------------------------- | ----------------- | --------- | ---------------------------------------- |
| `APP_MAINTENANCE_MODE`             | ❌ Not Set        | 🔒 Secret | Maintenance mode (unset in steady-state) |
| `ALLOW_LOCALHOST_FALLBACK_IN_PROD` | ❌ Not Set        | 🔒 Secret | CI-only flag (never set in production)   |
| `MAX_WORKER_RECURSION_DEPTH`       | ⚠️ Optional       | 🔒 Secret | Worker recursion ceiling (default: 2)    |

---

## Optional - Multi-Site

| Variable                   | Production Status | Type      | Source                     |
| -------------------------- | ----------------- | --------- | -------------------------- |
| `NEXT_PUBLIC_DEFAULT_SITE` | ⚠️ Optional       | 🌐 Public | Default site for localhost |
| `WILDCARD_PARENT_DOMAINS`  | ⚠️ Optional       | 🔒 Secret | Wildcard domain routing    |

---

## Optional - Tuning

| Variable                        | Production Status | Type      | Source                                        |
| ------------------------------- | ----------------- | --------- | --------------------------------------------- |
| `TRUST_PROXY_HEADERS`           | ✅ Set            | 🔒 Secret | Set to `true` (behind Cloudflare)             |
| `AI_ALLOWED_LINK_DOMAINS`       | ⚠️ Optional       | 🔒 Secret | AI content link allow-list                    |
| `AI_GLOBAL_DAILY_CEILING_USD`   | ⚠️ Optional       | 🔒 Secret | AI spend ceiling (default: 50)                |
| `BCRYPT_ROUNDS`                 | ⚠️ Optional       | 🔒 Secret | Password hashing cost (default: 12)           |
| `LOG_LEVEL`                     | ⚠️ Optional       | 🔒 Secret | Logging verbosity (default: info)             |
| `LOG_SAMPLE_RATE`               | ⚠️ Optional       | 🔒 Secret | Log sampling (default: 1.0)                   |
| `RATE_LIMIT_MEMORY_MAX_ENTRIES` | ⚠️ Optional       | 🔒 Secret | In-memory rate limit entries (default: 10000) |

---

## CI/Deploy Only

| Variable                  | Production Status | Type      | Source                                    |
| ------------------------- | ----------------- | --------- | ----------------------------------------- |
| `SUPABASE_DB_POOLER_URL`  | ⚠️ Optional       | 🔒 Secret | IPv4 pooler URL for CI migrations         |
| `STAGING_SUPABASE_DB_URL` | ⚠️ Optional       | 🔒 Secret | Staging DB for smoke tests                |
| `DATABASE_URL`            | ⚠️ Optional       | 🔒 Secret | Direct Postgres connection (scripts only) |
| `SITE_URL`                | ⚠️ Optional       | 🔒 Secret | Canonical site URL for scripts            |
| `E2E_BASE_URL`            | ⚠️ Optional       | 🔒 Secret | Base URL for Playwright E2E tests         |

---

## Blind Spots

The following environment variables are not documented in the codebase and their production status cannot be verified without access to the production environment:

- All optional variables marked as ⚠️ may or may not be set
- Per-trigger cron secrets (CRON\_\*\_SECRET) - individual status unknown
- AI provider API keys and enable flags - individual status unknown
- Affiliate network API keys - individual status unknown
- Observability tokens (OTEL, Logpush) - status unknown

## References

- `.env.example` - Complete environment variable reference
- `docs/CLOUDFLARE.md` - Cloudflare configuration and bindings
- `docs/supabase-production-config.md` - Supabase configuration
- `wrangler.jsonc` - Worker bindings and deploy-time variables
