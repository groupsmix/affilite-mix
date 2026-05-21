# Organization-Side Security Controls

Audit references: A207 (assumed breach), A208 (purple-team ATT&CK validation), A210 (phishing readiness).

This document records controls that cannot be fully enforced by application code but materially affect the red-team posture for `affilite-mix`. Code-side controls such as RLS, CSP, audit logs, and rate limiting are documented in `docs/threat-model.md` and `docs/soc2-controls-mapping.md`.

## 1. GitHub organization security

- Require MFA for all organization members; phishing-resistant passkeys or hardware keys are preferred for admins and release approvers.
- Require branch protection / rulesets on `main` with status checks, review, and CODEOWNERS approval.
- Require at least two independent reviewers for production deployment, security-sensitive code, `wrangler.jsonc`, Terraform, and GitHub Actions changes.
- Disable force-pushes and branch deletion on protected branches.
- Restrict repository creation and ruleset edits to organization admins.
- Review organization members, deploy keys, GitHub Apps, and fine-grained PATs quarterly.

## 2. Cloudflare account security

- Use scoped API tokens only; never use the Global API Key in CI/CD.
- Separate human dashboard roles from CI deploy tokens.
- Limit CI token permissions to Workers, R2/KV/Queues required for deployment, and zone DNS only where Terraform manages records.
- Require MFA for all Cloudflare dashboard users.
- Keep `workers_dev = false` for production workers so traffic must pass through zone-level WAF, Bot Fight Mode, and TLS/security-header controls.
- Keep production log shipping enabled (`LOG_SHIPPER_ENABLED=true`) or document an approved, time-boxed override in the deploy workflow.
- Review account members, API tokens, notification destinations, audit logs, and WAF bypass rules quarterly.

| Role | Typical holders | Notes |
| --- | --- | --- |
| Super Administrator | Org owner / security owner only | Minimize to 1–2 people. |
| Administrator | Security / platform lead | No routine development use. |
| Workers Developer | Engineers who deploy Workers | Scope to required resources only. |
| Analytics Viewer | SRE/on-call observers | Read-only; no deploy or secret access. |

## 3. Supabase project security

- Restrict Owner/Administrator roles to the minimum number of operators.
- Prefer read-only or project-scoped roles for developers.
- Keep production service-role keys only in deployment secret stores (`wrangler secret put`, GitHub environment secrets where unavoidable); never store them in `.env.local`.
- Restrict direct database connection strings to migration and audited operations.
- Review project members, API keys, database roles, and SQL editor activity quarterly.
- Rotate service-role and JWT secrets on personnel changes or suspected endpoint compromise.

## 4. Developer laptop hardening

- Full-disk encryption enabled (FileVault, BitLocker, or equivalent).
- Screen lock after short inactivity.
- OS, browser, package manager, and IDE kept up to date.
- Endpoint protection/EDR enabled where available.
- SSH keys protected with passphrases or hardware-backed keys.
- No production service-role, JWT, Stripe live, or Cloudflare API keys in local `.env.local` files.
- Use a password manager for secrets; no plaintext secret notes.

On suspected laptop compromise, revoke cloud/dashboard sessions, rotate accessible secrets, review GitHub and Cloudflare audit logs for the compromise window, and follow `docs/incident-response.md` plus `docs/secrets-rotation-runbook.md`.

## 5. Third-party service access

| Service | MFA required | Access review cadence | Notes |
| --- | --- | --- | --- |
| Stripe | Yes | Quarterly | Finance/security owner signs off on live-key access. |
| Resend | Yes | Quarterly | Verify sending domains and DKIM alignment. |
| Sentry | Yes | Quarterly | Verify alert destinations and project access. |
| Supabase | Yes | Quarterly | See Supabase section. |
| Cloudflare | Yes | Quarterly | See Cloudflare section. |
| GitHub | Yes | Quarterly | See GitHub section. |

## 6. Phishing and social-engineering readiness

- Commit SPF, DKIM, and DMARC records for production mail domains where Terraform owns DNS.
- Run phishing simulations only under the separate ROE in `docs/red-team-roe.md` and with HR/legal approval.
- MFA bypass success target is 0%; credential submission target is below 2%; report-rate target is at least 30%.
- Help-desk identity proofing, SIM-swap handling, and vendor-payment-change callbacks are business-process controls and should be owned outside this repo.

## 7. Quarterly evidence cadence

Quarterly access recertification should capture:

1. GitHub organization member export and ruleset/branch-protection evidence.
2. Cloudflare member/API-token export and alert destination evidence.
3. Supabase member/API-key export.
4. Sentry member/project access export.
5. Stripe team/API-key export.
6. Resend sending-domain and API-key export.
7. Exceptions, owner, expiry date, and compensating controls.

Reference this document from red-team reports when grading A207 assumed-breach controls. The application repository can document these controls, but enforcement requires the organization owners of GitHub, Cloudflare, Supabase, Stripe, Sentry, Resend, and endpoint management.
