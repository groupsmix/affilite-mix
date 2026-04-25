# Secrets Rotation & Maintenance

## Quarterly Compatibility Date Bump Checklist
1. Review Cloudflare Workers release notes
2. Update `compatibility_date` in `wrangler.jsonc`
3. Deploy to staging
4. Run integration tests
5. Deploy to production

## Mandatory Secret Rotation Process
The following secrets MUST be rotated **every 180 days** or immediately upon suspected compromise:
1. `SUPABASE_SERVICE_ROLE_KEY`
2. `ADMIN_JWT_SECRET`
3. `CRON_PUBLISH_SECRET`, `CRON_AI_SECRET`, `CRON_SITEMAP_SECRET`
4. `RESEND_API_KEY`
5. `STRIPE_SECRET_KEY` & `STRIPE_WEBHOOK_SECRET`
6. `SENTRY_DSN` & Auth Tokens
7. Cloudflare API Tokens
8. AI Provider Keys (OpenAI, Anthropic, etc.)

### Rotation Runbook:
1. Generate the new secret value on the provider platform.
2. If the secret requires no downtime, add it as a secondary token where supported (e.g., Stripe, multi-secret Cron Auth).
3. Update GitHub Actions secrets, Vercel/Cloudflare environment variables, and `1Password`/`Doppler` vaults.
4. Trigger a rolling deployment of the worker/server application.
5. Verify application health metrics (tail logs, 5xx rate).
6. Revoke the old secret from the provider platform.
