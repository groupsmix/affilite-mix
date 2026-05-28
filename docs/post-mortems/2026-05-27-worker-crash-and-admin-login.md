# Post-Mortem: Worker 500 Crash & Admin Login Failure

**Date:** 2026-05-27
**Duration:** ~4 hours (approximately 17:00–21:00 UTC)
**Severity:** P0 — complete site outage (500 on all routes)
**PRs:** #507, #508, #509, #510, #511

---

## Summary

The production Cloudflare Worker crashed on all routes with a 500 error.
Root cause was `instrumentation.ts` throwing a fatal error at startup when
`SENTRY_DSN`, `TOTP_ENCRYPTION_KEY`, and `APP_URL` were configured as
REQUIRED environment variables but were not set as Worker secrets. The
crash cascaded into admin login failures, which required relaxing several
session enforcement checks to restore dashboard access.

## Timeline

| Time (approx) | Event                                                                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ~17:00        | Deploy triggered after security audit hardening PRs merged                                                                                                                                                                           |
| ~17:05        | All routes return 500. Worker isolate crashes on cold start                                                                                                                                                                          |
| ~17:15        | PR #507: Bypassed `custom-worker.ts` to isolate crash source. Confirmed crash is in the Next.js app code, not the custom worker bundling                                                                                             |
| ~19:18        | PR #508: Identified root cause in `instrumentation.ts`. Moved `SENTRY_DSN`, `TOTP_ENCRYPTION_KEY` from REQUIRED to recommended (warn-only). Removed Turnstile (widget was causing rendering issues). Added `APP_URL` as wrangler var |
| ~19:30        | Site comes back online (200 on public routes)                                                                                                                                                                                        |
| ~19:45        | Admin login fails — token revocation check fails closed when KV is unavailable during page rendering                                                                                                                                 |
| ~20:00        | PR #509: Relaxed auth checks — gated binding enforcement and idle timeout behind `ADMIN_SESSION_STRICT` flag                                                                                                                         |
| ~20:15        | PR #510: Fixed RSC cache redirect loop after login (hard navigation instead of client-side router)                                                                                                                                   |
| ~20:30        | PR #511: Gated token revocation check behind `ADMIN_SESSION_STRICT` to prevent KV-unavailability from blocking valid sessions                                                                                                        |
| ~20:39        | Admin dashboard fully functional                                                                                                                                                                                                     |

## Root Causes

### Primary: Missing Worker secrets

`instrumentation.ts` was configured to throw on missing `SENTRY_DSN` and
`TOTP_ENCRYPTION_KEY` in production. These variables were defined in
`.env.example` as REQUIRED but had not been provisioned as Cloudflare Worker
secrets. The Worker isolate failed on every cold start.

### Secondary: Fail-closed auth checks without infrastructure

Three auth mechanisms assumed infrastructure (KV, consistent IP forwarding,
activity cookie propagation) was perfectly configured:

1. **Token revocation** (`isTokenRevoked`) — queries KV; fails closed when
   KV binding is unavailable, rejecting all valid sessions
2. **UA/IP binding** — requires consistent `cf-connecting-ip` propagation
3. **Activity cookie idle timeout** — requires HMAC-signed cookie to be
   set and propagated correctly on every request

When these checks failed closed simultaneously, no admin could log in.

### Tertiary: RSC cache poisoning

After login, Next.js React Server Components cached the pre-login redirect
response. The client-side router served the cached redirect instead of the
authenticated dashboard, creating an infinite redirect loop.

## Mitigations Applied

| PR   | What was disabled                                | Why                                  | Re-enabled?                                                                  |
| ---- | ------------------------------------------------ | ------------------------------------ | ---------------------------------------------------------------------------- |
| #507 | `custom-worker.ts` cron dispatch                 | Diagnostic — isolate crash source    | Yes (PR #508 restored)                                                       |
| #508 | Turnstile bot protection                         | Widget caused Worker rendering crash | No — documented as accepted risk (C-3)                                       |
| #508 | `SENTRY_DSN` / `TOTP_ENCRYPTION_KEY` as required | Crash on missing secrets             | Yes — `SENTRY_DSN` re-promoted to required in PR #520 (SEC-09)               |
| #509 | Binding + idle timeout enforcement               | KV unavailability blocked login      | Yes — re-enabled via `ADMIN_SESSION_STRICT=true` in wrangler.jsonc (PR #523) |
| #511 | Token revocation check                           | Same KV issue                        | Yes — re-enabled via `ADMIN_SESSION_STRICT=true`                             |

## What Would Have Caught This Earlier

1. **Staging deploy with secret validation**: A pre-production deploy step
   that verifies all REQUIRED secrets are present via `wrangler secret list`
   before promoting to production.

2. **Smoke test after deploy**: A post-deploy health check hitting
   `/api/health` and `/admin/login` that fails the deploy pipeline if
   either returns non-200.

3. **Canary deploys**: Gradual rollout (10% → 50% → 100%) with automatic
   rollback on elevated error rates. Cloudflare Workers supports gradual
   deployments.

4. **Environment parity CI check**: A CI step that diffs `wrangler.jsonc`
   vars/secrets against `.env.example` REQUIRED entries and fails if
   any REQUIRED var is missing from the Worker config.

## Prevention

- `ADMIN_SESSION_STRICT=true` is now set in `wrangler.jsonc:vars` (PR #523),
  re-enabling all three auth enforcement mechanisms in production.
- `instrumentation.ts` now uses a two-tier validation: REQUIRED vars cause
  a startup crash; RECOMMENDED vars emit warnings but allow boot (PR #508,
  refined in PR #520).
- `CRON_ALLOW_SHARED_FALLBACK_IN_PROD=0` is set, preventing the shared cron
  secret from masking per-trigger auth failures (PR #520 SEC-02).

## Action Items

- [x] Add post-deploy smoke test to CI/CD pipeline — `health-check` job in `deploy.yml` (deploy.yml:1302)
- [x] Implement `wrangler secret list` validation in deploy workflow — `Runtime drift — Worker secrets` step (deploy.yml:1456)
- [x] Evaluate canary deployment strategy for Worker updates — gradual rollout via `GRADUAL_ROLLOUT_ENABLED` (deploy.yml:1170)
- [ ] Re-evaluate Turnstile re-enablement when rendering is stable
