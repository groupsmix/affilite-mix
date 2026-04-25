# Threat Model (STRIDE)

| Threat | Vector | Mitigation Strategy |
|--------|--------|---------------------|
| **Multi-Tenant Isolation Breach** | IDOR / `site_id` query param manipulation. | Replaced query param checks with `authorizeResource` validating DB membership. |
| **Admin Compromise** | Stolen JWT / Password. | Enforced TOTP locking on `(user_id, IP /24)`. IP binding on JWTs. Super-admin alerts. |
| **Service-Role Abuse** | Exposing `SUPABASE_SERVICE_ROLE_KEY` in frontend or loose APIs. | Banned via `.eslintrc.json` `no-restricted-imports`. Restricted to `lib/server-only/service-role.ts`. |
| **Cron Abuse** | Calling cron endpoints externally to rack up AI costs. | `timingSafeEqual` checks on `Authorization: Bearer <secret>`. Non-public origin blocking. |
| **Queue Poisoning** | Sending bad JSON payloads to crash worker. | Zod schema validation at ingestion. Cloudflare Queue DLQ handles unprocessable messages. |
| **AI Prompt Injection** | Submitting malicious affiliate metadata. | Inputs sanitized. Content flagged as `draft`. Budget kill switches in place. |
| **Stripe Webhook Replay** | Replaying an old successful payment event. | Stripe signature validation + 5-minute timestamp tolerance + Idempotency keys. |
| **Affiliate Link Manipulation** | Changing a product link to an XSS payload. | SQL constraint `products_affiliate_url_https` enforcing valid schemes. |
| **SSRF** | Triggering internal API calls via URL ingest features. | Blocked `localhost`, `10.x`, `192.168.x`, `169.254.x.x` in `lib/security/ssrf.ts`. |
| **XSS** | User content rendering JavaScript. | Strict-Dynamic nonce-based CSP. React automatic escaping. Tiptap sanitization. |
| **CSRF** | Tricking admin into clicking a malicious link. | Cookie `sameSite=strict`. State-changing endpoints require explicit CSRF tokens or Cron bearer auth. |
