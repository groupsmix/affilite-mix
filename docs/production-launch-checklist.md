# Production Launch Checklist

Derived from the consolidated audit. Every item must be verified before
broad traffic is enabled. Items marked with a finding ID trace back to
the audit document.

## Build & CI (V-01)

- [ ] `npm ci` succeeds from a clean checkout
- [ ] `npm run lint` exits 0
- [ ] `npm run typecheck` exits 0
- [ ] `npm run test` exits 0
- [ ] `npm run build` exits 0
- [ ] `npm audit --audit-level=high` exits 0
- [ ] E2E tests passing against preview (`npm run e2e`)
- [ ] Accessibility checks passing (`npm run a11y`)
- [ ] Lighthouse checks reviewed

## Environment Variables (E-01)

- [ ] All `REQUIRED_SERVER_ENV` from `lib/server-env.ts` are set
- [ ] All `FEATURE_CONDITIONAL_ENV` conditions satisfied for production
- [ ] `AFFILIATE_DOMAIN_ENFORCEMENT=strict`
- [ ] `INTERNAL_HMAC_MIGRATION_MODE=strict`
- [ ] `TOTP_ENCRYPTION_KEY` set
- [ ] `CLICK_CACHE_HMAC_KEY` set
- [ ] `GDPR_HASH_SECRET` set
- [ ] `SENTRY_DSN` set
- [ ] `RESEND_API_KEY` set (or newsletter disabled)
- [ ] All per-trigger cron secrets set (CR-02)
- [ ] `ENABLE_TURNSTILE=true` (C-1 — anti-bot must be on before real traffic)
- [ ] `TURNSTILE_SECRET_KEY` set
- [ ] `NEXT_PUBLIC_TURNSTILE_SITE_KEY` set
- [ ] Verify login page serves a Turnstile widget in the production deployment

## Authorization & RBAC (A-01)

- [ ] Admin route authorization matrix reviewed (`docs/admin-route-authorization-matrix.md`)
- [ ] All admin mutation routes use `withAuthz` or are in exemption list
- [ ] Upload finalize gated by `withAuthz("upload","create")` (A-02)
- [ ] Upload audit logs use real siteId (A-03)
- [ ] Super-admin session binding includes role context (A-04)

## Authentication & Sessions (B-01 through B-04)

- [ ] TOTP secrets encrypted at rest via `TOTP_ENCRYPTION_KEY`
- [ ] Newsletter confirmation tokens hashed at rest (B-02)
- [ ] Logout clears all auth cookies (JWT, binding, activity, CSRF, active-site) (B-03)
- [ ] Session lifetime documented and matches implementation (B-04)

## Affiliate Redirect (R-01)

- [ ] Existing affiliate URLs audited against allowlist
- [ ] Domain enforcement active at redirect time in click route
- [ ] Emergency kill-switch documented

## Internal API / Cron (CR-01 through CR-05)

- [ ] HMAC strict mode in production (CR-01)
- [ ] Per-trigger cron secrets populated (CR-02)
- [ ] Cron liveness monitoring active (CR-03)
- [ ] Live cron triggers match `wrangler.jsonc` (CR-04)
- [ ] Heavy-crons worker decision made (CR-05)

## Cloudflare (CF-01 through CF-09)

- [ ] APP_CACHE_KV namespace created and bound
- [ ] RATE_LIMITER_DO created and bound
- [ ] CLICK_QUEUE + DLQ created and bound
- [ ] All Worker secrets populated (CF-02)
- [ ] Deploy-time binding preflight active (CF-05)
- [ ] Cloudflare API token scoped to minimum (CF-06)
- [ ] Cloudflare account on team org with 2FA (CF-07)
- [ ] KV_GRACE_MS=0 in production (CF-04)

## Database

- [ ] Supabase migrations applied in order with advisory locking
- [ ] Fresh-DB replay green (DB-07 fixed in 00087)
- [ ] RLS policies manually reviewed
- [ ] `purge_retention()` and all functions pinned to `SET search_path` (DB-01/DB-02, done in 00083)
- [ ] `erase_user()` RPC available (DB-16, migration 00088)
- [ ] Multi-site RLS behavior matches DB-04 decision
- [ ] Database backups + restore drill verified

## Observability (O-01)

- [ ] Durable log shipping configured (Logpush / Tail Worker)
- [ ] Alerts configured for: auth failures, cron failures, email failures, queue DLQ growth

## DNS & Frontend

- [ ] DNS + SSL verified for all tenant domains
- [ ] `robots.txt` and `sitemap.xml` verified in production
- [ ] CSP headers verified path-by-path

## Process

- [ ] Branch protection matches actual workflow check names (D-02)
- [ ] Rollback procedure tested
- [ ] Incident-response runbook exists (`docs/incident-response.md`)
- [ ] `SECURITY.md` disclosure contact is real (D-01)

## Evidence Pack (EV-01)

- [ ] Cloudflare production environment export
- [ ] Supabase RLS policies + schema snapshot
- [ ] Branch-protection screenshots
- [ ] Latest CI run results + SBOM
- [ ] Backup + restore test evidence
