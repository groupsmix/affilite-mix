# Access Review Policy

> **Audit ref:** A66-F1 (SOC 2 CC6.2/CC6.3), A67 (ISO 27001 A.5.15/A.5.18)
> **Owner:** Security
> **Review cadence:** Quarterly
> **Last reviewed:** 2026-05-03

---

## Purpose

This policy establishes a formal cadence for reviewing and recertifying access to platform systems, ensuring the principle of least privilege is maintained and stale access is revoked promptly.

## Scope

All access grants to:
- Supabase project (database, auth, storage)
- Cloudflare account (Workers, R2, KV, DNS)
- GitHub repository (push/admin/maintain roles)
- Stripe dashboard
- Sentry project
- AI provider API credentials
- Any other third-party service with platform data access

## Review Cadence

| Review type | Frequency | Owner | Participants |
|-------------|-----------|-------|-------------|
| Privileged access (super_admin, service accounts) | Monthly | Security lead | CTO + Security |
| Standard access (admin, editor roles) | Quarterly | Security lead | Team leads |
| Third-party/vendor access | Quarterly | Security lead | Security + Legal |
| API key and secret rotation verification | Quarterly | Security lead | SRE |

## Review Process

### 1. Generate Access Inventory

- Export current `admin_users` table with roles
- List GitHub collaborators and their permission levels
- List Cloudflare team members
- List Stripe dashboard users
- Cross-reference with `docs/access-recertification.md`

### 2. Validate Each Access Grant

For each user/service account:
- [ ] Is the person still employed/contracted?
- [ ] Is the access level appropriate for their current role?
- [ ] Has the account been active in the last 90 days?
- [ ] Are MFA/2FA requirements met?

### 3. Remediate

- Remove access for departed team members within 24 hours of departure
- Downgrade over-privileged accounts to the minimum required level
- Disable inactive accounts (90+ days of inactivity)
- Rotate any shared credentials

### 4. Document

- Record review results in `docs/access-recertification.md`
- Note any exceptions with justification and expiry date
- File the review record for SOC 2 evidence

## Emergency Access

Emergency access grants (e.g., incident response) must be:
1. Time-boxed (max 72 hours)
2. Logged in the audit log
3. Reviewed and revoked within the next business day

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-05-03 | Initial policy created (A66-F1) | Audit automation |
