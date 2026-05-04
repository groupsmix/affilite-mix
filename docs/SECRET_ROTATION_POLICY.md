# Secret Rotation Policy

> **A38#7: Documented secret rotation policy**

This document defines the secret rotation policy for the Affilite-Mix application.

## Scope

This policy applies to all secrets used by the application:
- Stripe API keys (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`)
- Supabase service role key
- JWT signing keys
- API keys for external integrations
- Database credentials
- Cloudflare API tokens

## Rotation Schedule

| Secret Type | Rotation Frequency | Rationale |
|-------------|-------------------|-----------|
| Stripe API keys | 90 days | PCI DSS compliance, principle of least privilege |
| Stripe webhook secret | 180 days or on suspected compromise | Balance security with webhook reliability |
| Supabase service role | 90 days | Database access credentials |
| JWT signing keys | 180 days | Token integrity, gradual key transition |
| Integration API keys | 90 days | Third-party access control |
| Cloudflare tokens | 180 days | Infrastructure access |

## Rotation Procedure

### 1. Pre-Rotation
- [ ] Verify new credentials are generated and tested in staging
- [ ] Schedule maintenance window if service interruption expected
- [ ] Notify team via #security-alerts Slack channel

### 2. Rotation Execution
- [ ] Update secret in Cloudflare Secrets store
- [ ] Verify application functions with new secret
- [ ] Monitor error rates for 15 minutes post-rotation

### 3. Post-Rotation
- [ ] Revoke old secret at provider (Stripe, Supabase, etc.)
- [ ] Update audit log with rotation timestamp
- [ ] Close rotation ticket

## Emergency Rotation

Rotate immediately upon:
- Suspected secret exposure (committed to repo, logged, etc.)
- Team member departure with secret access
- Security incident response

## Automation

Automated rotation is implemented for:
- Cloudflare API tokens via Terraform
- Stripe webhook secrets via API (manual trigger)

## Compliance Evidence

Audit trail maintained in:
- `audit_log` table for database credential rotation
- Cloudflare audit logs for token rotations
- Stripe Dashboard for API key activity
