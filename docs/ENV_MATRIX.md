# Environment Variable Matrix

This document provides a comprehensive matrix of all environment variables used in the Affilite-Mix application, their purposes, classification (required/recommended/conditional), and owner files.

## Required Environment Variables

These variables are required for the application to run correctly in production. Missing values cause a hard startup failure.

| Variable | Description | Owner File |
|----------|-------------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `lib/supabase-server.ts` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key | `lib/supabase-server.ts` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only, bypasses RLS) | `lib/supabase-server.ts` |
| `JWT_SECRET` | Secret for admin JWT and content preview token signing | `lib/auth.ts` |
| `INTERNAL_API_TOKEN` | Shared secret for internal middleware <-> API service-to-service auth | `lib/internal-auth.ts` |
| `SUPABASE_JWT_SECRET` | Secret for signing Supabase JWTs to enforce RLS | `lib/supabase-server.ts` |
| `CRON_SECRET` | Shared secret for authenticating scheduled cron job requests | `lib/cron-auth.ts` |
| `SENTRY_DSN` | Sentry DSN for server-side error monitoring (SEC-09: blind prod without it) | `lib/sentry.ts` |

## Recommended Environment Variables

These variables are recommended but not hard-required. Missing values produce a warning in production logs but do not crash the app.

| Variable | Description | Owner File |
|----------|-------------|------------|
| `APP_URL` | Fallback origin for absolute URLs where no tenant/request context exists (cron jobs, local-dev override). Production request paths always prefer the active site's own domain — never treat APP_URL as the canonical multi-tenant origin (F3-001). | `app/api/cron/price-scrape/route.ts` |
| `TOTP_ENCRYPTION_KEY` | Encryption key for TOTP shared secrets at rest (B-01) | `lib/totp-encryption.ts` |
| `RESEND_API_KEY` | Resend API key for transactional emails (password reset, newsletter confirmation). Required in production when NEWSLETTER_ENABLED=1. | `app/api/** (email senders)` |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret key for server-side captcha verification | `lib/turnstile.ts` |
| `STRIPE_SECRET_KEY` | Stripe secret API key (required when paid memberships are enabled) | `app/api/membership/** (checkout + webhook)` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret used to verify incoming webhook signatures | `app/api/membership/webhook/route.ts` |
| `STRIPE_PRICE_ID_INSIDER` | Stripe Price ID for the `insider` membership tier | `app/api/membership/checkout/route.ts` |
| `STRIPE_PRICE_ID_PRO` | Stripe Price ID for the `pro` membership tier | `app/api/membership/checkout/route.ts` |

## Feature-Conditional Environment Variables

These variables become required when specific features are enabled or when running in production.

### Turnstile (Anti-Bot)

| Condition | Required Variables | Description | Owner File |
|-----------|-------------------|-------------|------------|
| `ENABLE_TURNSTILE` is set | `TURNSTILE_SECRET_KEY` | Turnstile server-side secret | `lib/turnstile.ts` |
| `ENABLE_TURNSTILE` is set | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Turnstile client-side site key | `components/turnstile.tsx` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set | `TURNSTILE_SECRET_KEY` | Turnstile server-side secret (legacy compatibility) | `lib/turnstile.ts` |

### Stripe (Memberships)

| Condition | Required Variables | Description | Owner File |
|-----------|-------------------|-------------|------------|
| `STRIPE_SECRET_KEY` is set | `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | `app/api/membership/webhook/route.ts` |

### Newsletter

| Condition | Required Variables | Description | Owner File |
|-----------|-------------------|-------------|------------|
| `NEWSLETTER_ENABLED` is set | `RESEND_API_KEY` | Resend API key | `app/api/newsletter/**` |

### Production-Specific Requirements

| Condition | Required Variables | Description | Owner File |
|-----------|-------------------|-------------|------------|
| `NODE_ENV=production` | `SENTRY_DSN` | Sentry DSN for error monitoring and incident response | `lib/sentry.ts` |
| `NODE_ENV=production` | `AFFILIATE_DOMAIN_ENFORCEMENT` | Must be 'strict' in production to prevent open affiliate redirector (R-01) | `app/api/track/click/route.ts` |
| `NODE_ENV=production` | `INTERNAL_HMAC_MIGRATION_MODE` | Must be 'strict' in production — disables legacy bearer fallback for internal endpoints (CR-01) | `lib/internal-hmac.ts` |
| `NODE_ENV=production` | Per-trigger cron secrets | Per-trigger cron secret for each job (CR-02) | `lib/cron-registry.ts` |
| `NODE_ENV=production` | `CLICK_CACHE_HMAC_KEY` | Dedicated HMAC key for click-cache integrity (CF-03). Rotation does not trigger cache stampede. | `app/api/track/click/route.ts` |
| `NODE_ENV=production` | `GDPR_HASH_SECRET` | Dedicated secret for GDPR-compliant PII hashing (CF-03). Decouples privacy hashing from auth. | `lib/analytics/epc.ts` |

## Per-Trigger Cron Secrets (Production Required)

Each cron job has its own dedicated secret in production:

| Variable | Cron Job | Owner File |
|----------|----------|------------|
| `CRON_PUBLISH_SECRET` | Publish cron | `lib/cron-registry.ts` |
| `CRON_STRIPE_SYNC_SECRET` | Stripe sync cron | `lib/cron-registry.ts` |
| `CRON_AI_SECRET` | AI generation cron | `lib/cron-registry.ts` |
| `CRON_SITEMAP_SECRET` | Sitemap generation cron | `lib/cron-registry.ts` |
| `CRON_RETENTION_SECRET` | Data retention cron | `lib/cron-registry.ts` |
| `CRON_COMMISSION_SECRET` | Commission calculation cron | `lib/cron-registry.ts` |
| `CRON_EPC_SECRET` | EPC calculation cron | `lib/cron-registry.ts` |
| `CRON_PRICE_SECRET` | Price scrape cron | `lib/cron-registry.ts` |
| `CRON_DEALS_SECRET` | Deals scrape cron | `lib/cron-registry.ts` |
| `CRON_CLICK_RECONCILE_SECRET` | Click reconciliation cron | `lib/cron-registry.ts` |
| `CRON_ACCESS_REVIEW_SECRET` | Access review cron | `lib/cron-registry.ts` |

## Security Classification

### High-Security Secrets (Require Rotation)

- `JWT_SECRET` - Admin session signing
- `INTERNAL_API_TOKEN` - Internal service authentication
- `SUPABASE_JWT_SECRET` - Supabase RLS enforcement
- `CRON_SECRET` - Legacy cron authentication (deprecated in favor of per-trigger secrets)
- `TOTP_ENCRYPTION_KEY` - TOTP secret encryption at rest
- `CLICK_CACHE_HMAC_KEY` - Click cache integrity
- `GDPR_HASH_SECRET` - PII hashing for GDPR compliance
- All per-trigger cron secrets

### Medium-Security Secrets

- `SUPABASE_SERVICE_ROLE_KEY` - Database access (bypasses RLS)
- `STRIPE_SECRET_KEY` - Payment processing
- `STRIPE_WEBHOOK_SECRET` - Webhook verification
- `TURNSTILE_SECRET_KEY` - Anti-bot verification

### Low-Security / Public

- `NEXT_PUBLIC_SUPABASE_URL` - Public Supabase endpoint
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Public Supabase key (RLS-enforced)
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` - Public Turnstile site key
- `SENTRY_DSN` - Error monitoring endpoint

## Rotation Cadence

See `docs/secret-rotation-cadence.md` for detailed rotation schedules and procedures.

## Environment-Specific Notes

### Development
- Many production-required secrets can use placeholder values
- Sentry can be omitted for local development
- Turnstile can be disabled for testing
- Stripe can be omitted if memberships are not being tested

### Staging
- Should mirror production configuration
- Use separate Stripe test keys
- Use separate Supabase project
- Use separate Sentry project

### Production
- All required variables must be set
- All feature-conditional variables for enabled features must be set
- All per-trigger cron secrets must be set
- Strict mode enforcement for HMAC and affiliate domains
