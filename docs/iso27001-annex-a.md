# ISO 27001:2022 Annex A Control Mapping

> **Audit ref:** A67
> **Date:** 2026-04-30
> **Standard:** ISO/IEC 27001:2022, Annex A (93 controls, 4 themes)

This document maps the platform's repository-level controls to ISO 27001:2022 Annex A. Controls marked "process/HR" are addressed outside the codebase via organisational policy.

## Theme 5: Organisational Controls

| Control | Title                                                                  | Status      | Evidence                                                                                                                                                          |
| ------- | ---------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A.5.1   | Policies for information security                                      | Implemented | `SECURITY.md`, `docs/incident-response.md`, `docs/release-process.md`                                                                                             |
| A.5.2   | Information security roles and responsibilities                        | Partial     | `.github/CODEOWNERS`, admin RBAC (`lib/authz.ts`)                                                                                                                 |
| A.5.3   | Segregation of duties                                                  | Partial     | CODEOWNERS, branch protection (`terraform/github/branch-protection.tf`), service-role allowlist (`lib/security/service-role-allowlist.ts`)                        |
| A.5.4   | Management responsibilities                                            | Process/HR  | Outside repo                                                                                                                                                      |
| A.5.5   | Contact with authorities                                               | Documented  | `docs/incident-response.md` (notification procedures)                                                                                                             |
| A.5.6   | Contact with special interest groups                                   | Process/HR  | Outside repo                                                                                                                                                      |
| A.5.7   | Threat intelligence                                                    | Implemented | Dependabot (`.github/dependabot.yml`), npm audit, CodeQL (`.github/workflows/codeql.yml`), Semgrep (`.github/workflows/semgrep.yml`), gitleaks (`.gitleaks.toml`) |
| A.5.8   | Information security in project management                             | Partial     | `docs/release-process.md`, CI gates (`.github/workflows/ci.yml`)                                                                                                  |
| A.5.9   | Inventory of information and other associated assets                   | Implemented | `docs/ropa.md` (data inventory), `package.json` (software inventory), SBOM pipeline                                                                               |
| A.5.10  | Acceptable use of information and other associated assets              | Process/HR  | Outside repo                                                                                                                                                      |
| A.5.11  | Return of assets                                                       | Process/HR  | Outside repo                                                                                                                                                      |
| A.5.12  | Classification of information                                          | Implemented | `docs/ropa.md` (Field-Level PII Classification Matrix)                                                                                                            |
| A.5.13  | Labelling of information                                               | Partial     | PII matrix labels columns; no runtime data-classification tagging                                                                                                 |
| A.5.14  | Information transfer                                                   | Implemented | TLS 1.3 (Cloudflare), HMAC-signed internal calls (`lib/internal-hmac.ts`), SCCs for cross-border                                                                  |
| A.5.15  | Access control                                                         | Implemented | `lib/auth.ts`, `lib/admin-guard.ts`, `lib/authz.ts`, RLS policies                                                                                                 |
| A.5.16  | Identity management                                                    | Implemented | `lib/auth.ts`, `admin_users` table, TOTP (migration 00045, `lib/totp.ts`)                                                                                         |
| A.5.17  | Authentication information                                             | Implemented | bcrypt cost-12 (`lib/password.ts`), JWT binding (`lib/jwt-binding.ts`), password policy (`lib/password-policy.ts`)                                                |
| A.5.18  | Access rights                                                          | Implemented | RBAC permissions (`lib/authz.ts`), `docs/admin-route-authorization-matrix.md`                                                                                     |
| A.5.19  | Information security in supplier relationships                         | Implemented | `docs/vendor-dpas.md`, `docs/schrems-ii-tia.md`                                                                                                                   |
| A.5.20  | Addressing information security within supplier agreements             | Implemented | DPAs with all sub-processors (see `docs/vendor-dpas.md`)                                                                                                          |
| A.5.21  | Managing information security in the ICT supply chain                  | Partial     | Dependabot, npm audit, SBOM; no formal supply-chain risk register                                                                                                 |
| A.5.22  | Monitoring, review and change management of supplier services          | Partial     | Quarterly vendor review (`docs/soc2-controls-mapping.md` CC9.1)                                                                                                   |
| A.5.23  | Information security for use of cloud services                         | Implemented | `docs/cloudflare-production.md`, `docs/CLOUDFLARE.md`, `docs/supabase-connection-pooling.md`                                                                      |
| A.5.24  | Information security incident management planning and preparation      | Implemented | `docs/incident-response.md`, `scripts/panic.sh`                                                                                                                   |
| A.5.25  | Assessment and decision on information security events                 | Implemented | Sentry alerts (`terraform/cloudflare/sentry-alerts.tf`), `docs/alerting-runbook.md`                                                                               |
| A.5.26  | Response to information security incidents                             | Implemented | `docs/incident-response.md`, `docs/DR-RUNBOOK.md`                                                                                                                 |
| A.5.27  | Learning from information security incidents                           | Partial     | Post-mortem template referenced in incident-response; no incident register in repo                                                                                |
| A.5.28  | Collection of evidence                                                 | Implemented | `audit_log` table, structured logging (`lib/logger.ts`), R2 archive                                                                                               |
| A.5.29  | Information security during disruption                                 | Implemented | `docs/DR-RUNBOOK.md`, maintenance mode (`middleware.ts`)                                                                                                          |
| A.5.30  | ICT readiness for business continuity                                  | Implemented | `docs/DR-RUNBOOK.md`, `docs/backup-strategy.md`, `docs/BACKUP-POLICY.md`, `.github/workflows/dr-drill.yml`                                                        |
| A.5.31  | Legal, statutory, regulatory and contractual requirements              | Implemented | `docs/ropa.md`, `docs/compliance-readiness.md`, privacy policy                                                                                                    |
| A.5.32  | Intellectual property rights                                           | Partial     | `docs/ATTRIBUTIONS.md`, open-source license compliance                                                                                                            |
| A.5.33  | Protection of records                                                  | Implemented | Retention policy in `docs/ropa.md`, `purge_retention()` function                                                                                                  |
| A.5.34  | Privacy and protection of PII                                          | Implemented | GDPR compliance suite (RoPA, DSAR, cookie consent, retention)                                                                                                     |
| A.5.35  | Independent review of information security                             | Partial     | External audit (this document); annual pentest referenced                                                                                                         |
| A.5.36  | Compliance with policies, rules and standards for information security | Partial     | CI enforcement, CodeQL, Semgrep, eslint security rules                                                                                                            |
| A.5.37  | Documented operating procedures                                        | Implemented | `docs/runbooks/`, `docs/observability-runbook.md`, `docs/secrets-rotation-runbook.md`                                                                             |

## Theme 6: People Controls

| Control | Title                                                      | Status      | Evidence                                                              |
| ------- | ---------------------------------------------------------- | ----------- | --------------------------------------------------------------------- |
| A.6.1   | Screening                                                  | Process/HR  | Outside repo                                                          |
| A.6.2   | Terms and conditions of employment                         | Process/HR  | Outside repo                                                          |
| A.6.3   | Information security awareness, education and training     | Process/HR  | Outside repo                                                          |
| A.6.4   | Disciplinary process                                       | Process/HR  | Outside repo                                                          |
| A.6.5   | Responsibilities after termination or change of employment | Partial     | `docs/access-recertification.md`, `docs/secrets-rotation-runbook.md`  |
| A.6.6   | Confidentiality or non-disclosure agreements               | Process/HR  | Outside repo                                                          |
| A.6.7   | Remote working                                             | Process/HR  | Outside repo                                                          |
| A.6.8   | Information security event reporting                       | Implemented | `SECURITY.md` (vulnerability disclosure), `docs/incident-response.md` |

## Theme 7: Physical Controls

| Control      | Title                      | Status | Evidence                                                                             |
| ------------ | -------------------------- | ------ | ------------------------------------------------------------------------------------ |
| A.7.1-A.7.14 | Physical security controls | N/A    | Cloud-only platform; physical security managed by Cloudflare, AWS (Supabase), Stripe |

## Theme 8: Technological Controls

| Control | Title                                                       | Status      | Evidence                                                                                                                  |
| ------- | ----------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| A.8.1   | User endpoint devices                                       | N/A         | Server-side platform; no managed endpoints                                                                                |
| A.8.2   | Privileged access rights                                    | Implemented | `lib/authz.ts` (RBAC), `lib/security/service-role-allowlist.ts`, `lib/server-only/service-role.ts`                        |
| A.8.3   | Information access restriction                              | Implemented | RLS policies (migration 00067), tenant isolation (`__tests__/tenant-isolation.test.ts`)                                   |
| A.8.4   | Access to source code                                       | Implemented | Branch protection, CODEOWNERS, required PR reviews                                                                        |
| A.8.5   | Secure authentication                                       | Implemented | bcrypt cost-12, TOTP (`lib/totp.ts`, `lib/totp-encryption.ts`), JWT binding, idle timeout                                 |
| A.8.6   | Capacity management                                         | Implemented | `docs/per-tenant-quotas.md`, `lib/quotas.ts`, rate limiting (`lib/rate-limit.ts`)                                         |
| A.8.7   | Protection against malware                                  | Implemented | Dependabot, npm audit, CodeQL, Semgrep                                                                                    |
| A.8.8   | Management of technical vulnerabilities                     | Implemented | `.github/workflows/security.yml`, `.github/dependabot.yml`, `docs/sbom-retention.md`                                      |
| A.8.9   | Configuration management                                    | Implemented | `wrangler.jsonc` (infra-as-code), `terraform/` (IaC), `__tests__/wrangler-binding-drift.test.ts`                          |
| A.8.10  | Information deletion                                        | Implemented | `purge_retention()` (migration 00085), DSAR erasure endpoint                                                              |
| A.8.11  | Data masking                                                | Implemented | IP truncation to /24, email hashing in logs, Sentry PII scrubbing                                                         |
| A.8.12  | Data leakage prevention                                     | Implemented | gitleaks, `sendDefaultPii: false`, PII denylist in `lib/logger.ts`                                                        |
| A.8.13  | Information backup                                          | Implemented | `docs/BACKUP-POLICY.md`, `docs/backup-strategy.md`, Supabase PITR                                                         |
| A.8.14  | Redundancy of information processing facilities             | Partial     | Cloudflare Workers (multi-region edge), Supabase single-region with PITR                                                  |
| A.8.15  | Logging                                                     | Implemented | `lib/logger.ts` (structured JSON), `audit_log` table, R2 archive                                                          |
| A.8.16  | Monitoring activities                                       | Implemented | Sentry, Cloudflare Analytics, `docs/observability-runbook.md`, `docs/alerting-runbook.md`                                 |
| A.8.17  | Clock synchronization                                       | N/A         | Platform-managed (Cloudflare Workers, AWS)                                                                                |
| A.8.18  | Use of privileged utility programs                          | Implemented | `scripts/` gated by `CRON_SECRET`, `lib/cron-auth.ts`                                                                     |
| A.8.19  | Installation of software on operational systems             | N/A         | Serverless (Cloudflare Workers); no OS-level package management                                                           |
| A.8.20  | Networks security                                           | N/A         | Cloud-only; network managed by Cloudflare/AWS                                                                             |
| A.8.21  | Security of network services                                | Implemented | TLS 1.3, WAF (Cloudflare), SSRF guard (`lib/ssrf-guard.ts`)                                                               |
| A.8.22  | Segregation of networks                                     | N/A         | Cloud-only; Supabase connection pooling (`docs/supabase-connection-pooling.md`)                                           |
| A.8.23  | Web filtering                                               | N/A         | No outbound browsing from workers                                                                                         |
| A.8.24  | Use of cryptography                                         | Implemented | `lib/totp-encryption.ts` (AES-256-GCM), `lib/jwt-secret.ts`, bcrypt cost-12, Supabase AES-256 at rest, TLS 1.3 in transit |
| A.8.25  | Secure development life cycle                               | Implemented | CI/CD gates, CodeQL, Semgrep, required PR reviews, `docs/release-process.md`                                              |
| A.8.26  | Application security requirements                           | Implemented | `docs/threat-model.md`, CSP nonces (`lib/csp.ts`), CSRF (`lib/csrf.ts`)                                                   |
| A.8.27  | Secure system architecture and engineering principles       | Implemented | `docs/architecture.md`, `docs/multi-site-architecture.md`, tenant isolation by design                                     |
| A.8.28  | Secure coding                                               | Implemented | eslint security rules, Semgrep, `lib/sanitize-html.ts`, `lib/safe-redirect.ts`, `lib/ssrf-guard.ts`                       |
| A.8.29  | Security testing in development and acceptance              | Implemented | `__tests__/` (94 test files), `e2e/` (11 specs), `.github/workflows/ci.yml`                                               |
| A.8.30  | Outsourced development                                      | N/A         | No outsourced development                                                                                                 |
| A.8.31  | Separation of development, test and production environments | Partial     | `.dev.vars.example` for local dev; staging via Cloudflare preview deployments; production via `wrangler.jsonc`            |
| A.8.32  | Change management                                           | Implemented | Git branching, PR reviews, CI gates, `docs/release-process.md`                                                            |
| A.8.33  | Test information                                            | Partial     | `supabase/seed.sql` for dev; verify no real PII in seed data                                                              |
| A.8.34  | Protection of information systems during audit testing      | N/A         | Read-only audit; no production access required                                                                            |

## Last Updated

2026-04-30 (initial creation per audit A67)
