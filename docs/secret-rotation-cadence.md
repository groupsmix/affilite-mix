# Secret Rotation Cadence

This document tracks the rotation schedule for all production secrets used in the affilite-mix platform. Regular secret rotation is a critical security control to limit the blast radius of credential compromise.

## Rotation Policy

- **High-risk secrets** (JWT signing, internal API tokens): Rotate quarterly (every 90 days)
- **Medium-risk secrets** (third-party API keys, webhook secrets): Rotate semi-annually (every 180 days)
- **Low-risk secrets** (public-facing tokens, non-critical API keys): Rotate annually (every 365 days)

## Production Secrets Inventory

### High-Risk Secrets (Quarterly Rotation)

| Secret Name                         | Purpose                                       | Last Rotated | Next Rotation | Notes                                           |
| ----------------------------------- | --------------------------------------------- | ------------ | ------------- | ----------------------------------------------- |
| `JWT_SECRET` / `JWT_SECRET_CURRENT` | JWT signing for authentication                | TBD          | TBD           | Supports key rotation with CURRENT/NEXT pattern |
| `INTERNAL_API_TOKEN`                | Internal API authentication (legacy fallback) | TBD          | TBD           | Being phased out in favor of per-purpose tokens |
| `TOTP_ENCRYPTION_KEY`               | TOTP secret encryption at rest                | TBD          | TBD           | Admin 2FA security                              |
| `CLICK_CACHE_HMAC_KEY`              | Click fingerprint HMAC signing                | TBD          | TBD           | Fraud detection integrity                       |
| `GDPR_HASH_SECRET`                  | GDPR data hashing/pseudonymization            | TBD          | TBD           | Privacy compliance                              |

### Per-Purpose Internal Tokens (Quarterly Rotation)

| Secret Name                   | Purpose                         | Last Rotated | Next Rotation | Notes |
| ----------------------------- | ------------------------------- | ------------ | ------------- | ----- |
| `INTERNAL_API_TOKEN_ADMIN`    | Admin API internal calls        | TBD          | TBD           |       |
| `INTERNAL_API_TOKEN_CRON`     | Cron job internal calls         | TBD          | TBD           |       |
| `INTERNAL_API_TOKEN_WEBHOOK`  | Webhook processing              | TBD          | TBD           |       |
| `INTERNAL_API_TOKEN_INTERNAL` | Internal services communication | TBD          | TBD           |       |

### Cron Job Secrets (Quarterly Rotation)

| Secret Name                   | Purpose                                   | Last Rotated | Next Rotation | Notes |
| ----------------------------- | ----------------------------------------- | ------------ | ------------- | ----- |
| `CRON_PUBLISH_SECRET`         | Content publishing cron authentication    | TBD          | TBD           |       |
| `CRON_STRIPE_SYNC_SECRET`     | Stripe sync cron authentication           | TBD          | TBD           |       |
| `CRON_AI_SECRET`              | AI processing cron authentication         | TBD          | TBD           |       |
| `CRON_SITEMAP_SECRET`         | Sitemap generation cron authentication    | TBD          | TBD           |       |
| `CRON_RETENTION_SECRET`       | Data retention cron authentication        | TBD          | TBD           |       |
| `CRON_COMMISSION_SECRET`      | Commission processing cron authentication | TBD          | TBD           |       |
| `CRON_EPC_SECRET`             | EPC tracking cron authentication          | TBD          | TBD           |       |
| `CRON_PRICE_SECRET`           | Price scrape cron authentication          | TBD          | TBD           |       |
| `CRON_DEALS_SECRET`           | Deals processing cron authentication      | TBD          | TBD           |       |
| `CRON_CLICK_RECONCILE_SECRET` | Click reconciliation cron authentication  | TBD          | TBD           |       |
| `CRON_ACCESS_REVIEW_SECRET`   | Access review cron authentication         | TBD          | TBD           |       |

### Medium-Risk Secrets (Semi-Annual Rotation)

| Secret Name                 | Purpose                               | Last Rotated | Next Rotation | Notes                               |
| --------------------------- | ------------------------------------- | ------------ | ------------- | ----------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin API access             | TBD          | TBD           | Requires coordination with Supabase |
| `STRIPE_SECRET_KEY`         | Stripe API access                     | TBD          | TBD           | Restricted API key (rk*live*)       |
| `STRIPE_WEBHOOK_SECRET`     | Stripe webhook signature verification | TBD          | TBD           | whsec\_ token                       |
| `RESEND_API_KEY`            | Transactional email service           | TBD          | TBD           |                                     |
| `CLOUDFLARE_API_TOKEN`      | Cloudflare API access                 | TBD          | TBD           | Infrastructure management           |
| `TURNSTILE_SECRET_KEY`      | Turnstile bot protection              | TBD          | TBD           | Cloudflare Turnstile                |

### Low-Risk Secrets (Annual Rotation)

| Secret Name             | Purpose                       | Last Rotated | Next Rotation | Notes                             |
| ----------------------- | ----------------------------- | ------------ | ------------- | --------------------------------- |
| `SENTRY_DSN`            | Sentry error tracking         | TBD          | TBD           | Public DSN for client-side errors |
| `APP_URL`               | Application base URL          | TBD          | TBD           | Configuration, not credential     |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account identifier | TBD          | TBD           | Identifier, not credential        |

## Rotation Procedure

1. **Generate new secret** using cryptographically secure method
2. **Update Cloudflare Workers** via `wrangler secret put <SECRET_NAME> --env production`
3. **Update GitHub Actions** secrets if applicable
4. **Test rotation** in staging environment first (if available)
5. **Monitor for errors** in Sentry/logs after production rotation
6. **Update this document** with rotation date and next rotation date
7. **Document any coordination requirements** (e.g., with Supabase for service role key)

## Emergency Rotation

In case of suspected compromise:

- Immediately rotate all high-risk secrets
- Rotate any secrets that may have been exposed in logs or error messages
- Conduct security review of access logs
- Rotate affected secrets even if scheduled rotation is not due
- Document incident and update rotation cadence if needed

## Coordination Requirements

- **Supabase Service Role Key**: Coordinate with Supabase support; may require service restart
- **Stripe Webhook Secret**: Update in Stripe Dashboard before updating in Workers to avoid webhook failures
- **Cloudflare API Token**: Ensure no active Terraform runs during rotation

## Compliance Notes

- Secret rotation is required for SOC 2 Type II compliance (CC6.1, CC6.2)
- ISO 27001 Annex A.9.4 requires periodic secret changes
- GDPR Article 32 requires appropriate technical measures for security
- Document all rotations with timestamps for audit trail

## Related Documentation

- [Security Overview](../SECURITY.md)
- [Internal Auth Documentation](../lib/internal-auth.ts)
- [Wrangler Configuration](../wrangler.jsonc)
- [SOC 2 Compliance Mapping](./soc2-controls-mapping.md)
- [ISO 27001 Annex A Mapping](./iso27001-annex-a.md)

---

**Last Updated**: 2026-06-11  
**Next Review**: 2026-09-11 (quarterly)  
**Owner**: Security Team  
**Approver**: CTO / Security Lead
