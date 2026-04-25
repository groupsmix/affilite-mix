# Cloudflare Infrastructure & Operations

## Cloudflare WAF & Caching Config
- **WAF Rules:** Active for malicious payloads, SQLi, XSS, and rate limiting brute force.
- **Bot Protection:** Managed challenge on high-risk endpoints (`/api/auth/login`).
- **Cache Rules:** Custom rules for `/public/assets` and `/products/*` caching.
- **Rate Limits:** Enforced via DO rate limiter in `lib/rate-limit.ts`.
- **TLS & HSTS:** Enforced strict mode, HSTS max-age 6 months.
- **Origin Protection:** Only Cloudflare IPs allowed at origin.

## Queues & DLQ Monitoring
- **DLQ Binding:** `click-queue-dlq` captures unprocessable tracking events.
- **Monitoring:** Alert configured on queue dead letters > 0.
- **Poison Message Policy:** Replay script available in `/scripts/replay-dlq.ts`.
- **Dead-Letter Retention:** 14 days.

## Cron Dashboard
Every cron job emits:
- Started, Finished, Duration.
- Records processed, Records failed.
- Last success, Last failure.
- Monitored via Healthchecks.io.

## Uptime Monitoring
- Primary domain & Tenant domains
- `/admin` login page
- `/api/health`
- `sitemap.xml` & `robots.txt`
- Critical public pages

## Disaster Recovery Runbook
- **Restore DB:** Use Supabase PITR to restore to nearest minute.
- **Rollback Worker:** Deploy previous stable tag via GitHub Actions `Rollback` workflow.
- **Rotate Secrets:** See `docs/secrets-rotation-runbook.md`.
- **Disable Cron:** Remove triggers from `wrangler.jsonc` and deploy.
- **Drain/Replay Queue:** Use Wrangler CLI queue commands.
- **Recover Hacked Admin:** Run emergency DB query to invalidate `admin_users` session and change password hash.
