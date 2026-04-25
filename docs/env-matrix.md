# Environment Variables Matrix

| Variable | Required? | Environment | Example | Secret/Public | Rotation Owner | Where Used |
|----------|-----------|-------------|---------|---------------|----------------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | All | `https://x.supabase.co` | Public | DevOps | Client & Server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | All | `eyJ...` | Public | DevOps | Client & Server |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | All | `eyJ...` | Secret | DevOps | `lib/server-only/service-role.ts` |
| `SUPABASE_DB_POOLER_URL` | Yes | Prod/Staging | `postgresql://...` | Secret | DBA | ORM/Direct Connect |
| `CRON_PUBLISH_SECRET` | Yes | Prod/Staging | `super-secret` | Secret | Backend | `app/api/cron/publish` |
| `CRON_AI_SECRET` | Yes | Prod/Staging | `ai-secret` | Secret | Backend | `app/api/cron/ai-generate` |
| `CRON_SITEMAP_SECRET` | Yes | Prod/Staging | `site-secret` | Secret | Backend | `app/api/cron/sitemap-refresh` |
| `ADMIN_JWT_SECRET` | Yes | Prod/Staging | `jwt-secret` | Secret | SecOps | `lib/jwt-binding.ts` |
| `SENTRY_DSN` | Yes | Prod/Staging | `https://x@sentry.io/1` | Secret | Ops | `sentry.client.config.ts` |
| `APP_URL` | Yes | Prod/Staging | `https://domain.com` | Public | Ops | Auth / Forgot Password |
| `RESEND_API_KEY` | Yes | Prod/Staging | `re_123...` | Secret | Ops | Email Delivery |
| `STRIPE_SECRET_KEY` | Yes | Prod/Staging | `sk_test_...` | Secret | Finance | Payment Intents |
| `STRIPE_WEBHOOK_SECRET` | Yes | Prod/Staging | `whsec_...` | Secret | Finance | Webhook Signature |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Yes | Prod/Staging | `0x4A...` | Public | SecOps | Frontend Captcha |
