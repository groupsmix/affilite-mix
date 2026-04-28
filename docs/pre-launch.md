# Pre-Launch Readiness Checklist

**Purpose:** single checked-in artifact for the go/no-go review before a
production cutover. Tick every box — with a date and owner — before
announcing launch. Anything unchecked is a blocker.

**Scope:** this is the short-form sign-off. The long-form reference
material lives in [`docs/ops/production-readiness.md`](ops/production-readiness.md);
this file is intentionally compact so it can be reviewed in a single
stand-up.

> Open a PR that updates this file each time a launch (or re-launch after
> a significant outage) is executed. Do not overwrite history — add a
> new dated section below.

---

## Sign-off record

| Launch date | Sign-off by | Commit | Notes                    |
| ----------- | ----------- | ------ | ------------------------ |
| _pending_   |             |        | First production cutover |

---

## 1. Infrastructure & bindings

- [ ] `wrangler.jsonc` KV / DO / Queue / R2 bindings present and IDs match the production account — cross-check with `docs/ops/production-readiness.md` "Required Cloudflare Bindings"
- [ ] `affilite-mix` and `affilite-mix-heavy-crons` Workers both deploy cleanly to production from CI (green `deploy.yml` run)
- [ ] Custom domains attached and DNS TTLs lowered for the cutover
- [ ] R2 bucket `next-inc-cache` exists with the correct ACL
- [ ] Log-shipper Worker configured (or `LOG_SHIPPER_ENABLED=false` set deliberately)

## 2. Secrets & credentials

- [ ] Every secret listed in `.env.example` is present in production (`wrangler secret list`)
- [ ] GitHub Actions secrets (`CLOUDFLARE_API_TOKEN`, `SUPABASE_*`, `STAGING_SUPABASE_DB_URL`, etc.) configured and NOT using a global Cloudflare API key
- [ ] Rotation schedule in [`docs/secrets-rotation-runbook.md`](secrets-rotation-runbook.md) recorded in the team calendar
- [ ] Break-glass path tested in staging: `CONFIRM=i-understand WORKER_NAME=affilite-mix-staging make panic` (dry-run verified first)

## 3. Database & Supabase

- [ ] All migrations in `supabase/migrations/` applied to production (`_migrations_applied` reflects current HEAD)
- [ ] Row Level Security enabled on every tenant-scoped table (verified via `scripts/db-audit.sh`)
- [ ] Connection pooling URL (pgbouncer) in use, not the direct DB URL
- [ ] Nightly backups confirmed in the Supabase dashboard; point-in-time recovery window acceptable
- [ ] Service-role key is **only** used in server-side code paths (see `__tests__/admin-routes-no-service-role.test.ts`)

## 4. Authentication & authorization

- [ ] `JWT_SECRET` rotated within last 90 days and recorded in rotation log
- [ ] `BCRYPT_ROUNDS` set to the current project default (see [`lib/password.ts`](../lib/password.ts)) — G-50
- [ ] Super-admin accounts have TOTP enforced; recovery codes distributed to a second admin
- [ ] CSRF double-submit middleware covers every non-cron POST / PUT / PATCH / DELETE route (see `middleware.ts`)
- [ ] Cron routes authenticate via Bearer secret only (validated by `cron-registry.test.ts`)

## 5. Security headers & CSP

- [ ] `Content-Security-Policy` verified end-to-end with no `unsafe-inline` or `unsafe-eval` in production (`__tests__/csp.test.ts` green)
- [ ] `Strict-Transport-Security`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` present on every response
- [ ] `Permissions-Policy` includes `interest-cohort=()` (FLoC / Topics opt-out — G-51)
- [ ] Turnstile site + secret keys configured for every form protected by captcha

## 6. Rate limiting & abuse

- [ ] `RATE_LIMITER_DO` binding resolves to the production Durable Object namespace
- [ ] Login route per-IP + per-email limits match intended policy (G-50: 3/15min per IP, 10/15min per email)
- [ ] Newsletter double-opt-in and unsubscribe abuse rate-limits verified
- [ ] Click-queue DLQ has an alert on `depth > 0`

## 7. Observability

- [ ] Sentry DSNs (server + browser) set and an intentional test error is visible in the Sentry inbox
- [ ] Cloudflare observability enabled on both Workers (`observability.enabled: true`)
- [ ] Cron liveness alarms documented in [`docs/cron-liveness.md`](cron-liveness.md) and wired to Sentry (G-52)
- [ ] Burn-rate alerts live per [`docs/alerting-runbook.md`](alerting-runbook.md)
- [ ] Logpush destination (S3 / R2 / external SIEM) configured

## 8. Performance

- [ ] Latest `size-limit` run within budget (see `.size-limit.js`)
- [ ] Lighthouse CI run green against the staging URL (`lighthouserc.cjs`)
- [ ] Load test baseline recorded via `load-test.js`; P95 latency acceptable

## 9. Privacy, compliance & content

- [ ] Cookie-consent banner loads on first visit and gates non-essential scripts
- [ ] Privacy policy, terms, and DPA links published on every site
- [ ] Affiliate disclosure present on every site per `docs/ai-governance.md`
- [ ] Data retention cron (`data-retention`) running on schedule — see [`docs/cron-liveness.md`](cron-liveness.md)
- [ ] GDPR DSAR runbook in [`docs/ropa.md`](ropa.md) reviewed

## 10. Operational readiness

- [ ] DR drill executed within last 90 days (`docs/dr-drill-checklist.md`)
- [ ] On-call rota published; paging integration to Sentry / PagerDuty verified
- [ ] Rollback path verified (`npx wrangler rollback`) and documented in `docs/rollback-strategy.md`
- [ ] Break-glass (`make panic`) tested in staging within last 30 days (G-53)
- [ ] Incident-response runbook ([`docs/incident-response.md`](incident-response.md)) reviewed and link posted to the on-call channel

---

## Appendix — how to use

1. Fork this file in a launch PR (e.g. `pre-launch/2026-05-01.md`) or
   append a new section to the sign-off record table.
2. Walk the list with the person accountable for each area. Each
   checkbox must be ticked by the owner, not the launch pilot.
3. Link the launch PR to this commit so the audit trail is intact.
4. After cutover, move any unchecked items into a follow-up issue with
   a date; do not leave them dangling.

For the exhaustive reference version (command examples, dashboard
screenshots, binding matrix) see
[`docs/ops/production-readiness.md`](ops/production-readiness.md).
