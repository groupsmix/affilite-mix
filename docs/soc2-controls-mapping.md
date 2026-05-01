# SOC 2 Type II Controls Mapping (OF-18)

This document maps Trust Services Criteria to specific, auditable evidence in the repository.

## Common Criteria (CC)

| Control | Description | Evidence | File/Location | Owner |
|---------|-------------|----------|---------------|-------|
| CC1.1 | Integrity & ethics commitment | Code of Conduct, employee sign-off | `docs/code-of-conduct.md` | People |
| CC1.2 | Board oversight | Quarterly security review minutes (Q1-2026) | `docs/security-reviews/2026-Q1-minutes.md` | CEO |
| CC1.3 | Organisational structure | RBAC roles and SOD matrix | `docs/sod-matrix.md`, `config/rbac/roles.json` | Sec |
| CC2.1 | Internal communication | Security policy published internally | `docs/communication-policy.md` | People |
| CC2.2 | External communication | Privacy policy + accessibility statement | `app/(public)/privacy/page.tsx`, `app/(public)/accessibility/page.tsx` | DPO |
| CC3.1 | Risk assessment | Risk register maintained quarterly | `docs/risk-register.md` | Sec |
| CC3.2 | Risk identification | Threat model + audit findings | `docs/threat-model.md`, `docs/audit/` | Sec |
| CC4.1 | Monitoring | OTEL traces + Cloudflare analytics + SLO burn-rate alerts | `terraform/cloudflare/alerts.tf`, `docs/slo.md` | SRE |
| CC4.2 | Internal audit | Automated compliance checks in CI | `.github/workflows/security.yml`, `__tests__/infrastructure-controls.test.ts` | Sec |
| CC5.1 | Control activities | IaC-managed branch protection, rate limiting, authz middleware | `terraform/github/branch-protection.tf`, `lib/authz.ts`, `lib/rate-limit.ts` | Sec |
| CC6.1 | Logical access controls | JWT auth, RBAC, withAuthz middleware, super-admin gate | `lib/authz.ts`, `lib/admin-guard.ts`, `app/api/auth/` | Sec |
| CC6.2 | Authentication | bcrypt passwords, TOTP, session rotation | `lib/password.ts`, `app/api/admin/users/me/totp/route.ts` | Sec |
| CC6.3 | Access removal | DSAR erasure + user deactivation route | `app/api/admin/privacy/user/route.ts` | DPO |
| CC7.1 | System operations | Health checks, cron liveness, uptime monitoring | `app/api/health/route.ts`, `lib/cron-liveness.ts` | SRE |
| CC7.2 | Security incidents | Sentry alerting + incident response runbook | `.github/workflows/security.yml`, `docs/incident-response.md` | Sec |
| CC8.1 | Change management | Branch protection (2 reviews, signed commits, required CI) | `terraform/github/branch-protection.tf`, `.github/rulesets/main-protection.json` | Eng |
| CC9.1 | Risk mitigation | Vendor DPA register, Schrems II TIA | `docs/tia/`, `docs/compliance-readiness.md` | DPO |

## Processing Integrity (PI)

| Control | Description | Evidence | File/Location | Owner |
|---------|-------------|----------|---------------|-------|
| PI1.1 | Complete and accurate processing | Integration tests, Stripe atomic events, DSAR atomic RPC | `__tests__/integration/`, `lib/dal/stripe-events.ts`, `supabase/migrations/20260501_gdpr_atomic_erasure.sql` | Eng |

## Availability (A)

| Control | Description | Evidence | File/Location | Owner |
|---------|-------------|----------|---------------|-------|
| A1.1 | Availability commitments | SLO documented + burn-rate alerts enabled | `docs/slo.md`, `terraform/cloudflare/alerts.tf` (alerts_enabled = true) | SRE |
| A1.2 | Capacity management | Cloudflare Workers auto-scaling + KV rate limiting | `wrangler.jsonc`, `lib/rate-limit.ts` | SRE |

## Confidentiality (C)

| Control | Description | Evidence | File/Location | Owner |
|---------|-------------|----------|---------------|-------|
| C1.1 | Confidential information identification | Data classification policy | `docs/data-classification.md` | DPO |
| C1.2 | Confidential information disposal | GDPR atomic erasure RPC | `supabase/migrations/20260501_gdpr_atomic_erasure.sql` | DPO |

## Privacy (P)

| Control | Description | Evidence | File/Location | Owner |
|---------|-------------|----------|---------------|-------|
| P1.1 | Privacy notice | Published privacy policy | `app/(public)/privacy/page.tsx` | DPO |
| P3.1 | Consent collection | CMP + server-side consent_log | `app/(public)/components/cookie-consent-cmp.tsx`, `app/api/consent/log/route.ts` | DPO |
| P4.1 | Data use limitation | DSAR routes + processing_restricted_at | `app/api/admin/privacy/user/route.ts` | DPO |
| P6.1 | Disclosure to third parties | Vendor DPA register + Schrems II TIA | `docs/tia/`, `docs/compliance-readiness.md` | DPO |
| P8.1 | Data subject requests | DSAR export, erasure, restriction endpoints | `app/api/admin/privacy/user/route.ts` | DPO |

## Evidence Collection Schedule

- **Quarterly**: Security review minutes, ASV scan reports, penetration test findings
- **Monthly**: Access review (SOD check CI output), SLO reports
- **Continuous**: Branch protection logs, audit_log table, consent_log table, Cloudflare alerts

*Last updated: 2026-05-01*
