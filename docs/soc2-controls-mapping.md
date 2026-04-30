# SOC 2 Controls Mapping

> **Purpose**: Map repository-level controls to SOC 2 Trust Service Criteria
> so auditors can trace evidence from code to compliance.
>
> **Audit reference**: "What would fail SOC 2 / ISO 27001 review"

## CC6.1 — Logical and Physical Access Controls

| Control            | Implementation                                         | Evidence                                                                         |
| ------------------ | ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Authentication     | JWT with issuer/audience, token ID, revocation, bcrypt | `lib/auth.ts`, `lib/jwt-binding.ts`                                              |
| Authorization      | `requireAdmin()`, `withAuthz()`, RBAC permissions      | `lib/admin-guard.ts`, `lib/authz.ts`                                             |
| MFA                | TOTP enrollment/verification                           | `lib/totp.ts`, `app/api/admin/users/me/totp/`                                    |
| Session management | Idle timeout, binding cookies, secure flags            | `lib/auth.ts`, `lib/cookie-utils.ts`                                             |
| Branch protection  | Required PRs, status checks, CODEOWNERS                | `.github/rulesets/main-protection.json`, `terraform/github/branch-protection.tf` |
| Secret scanning    | Gitleaks + GitHub push protection                      | `.github/workflows/security.yml`, `.gitleaks.toml`                               |

## CC6.6 — System Operations

| Control             | Implementation                                         | Evidence                                             |
| ------------------- | ------------------------------------------------------ | ---------------------------------------------------- |
| CI/CD pipeline      | Lint, test, typecheck, build, security gates           | `.github/workflows/ci.yml`                           |
| Deployment safety   | Staging migration test, binding validation, smoke test | `.github/workflows/deploy.yml`                       |
| Rollback capability | Dedicated rollback workflow                            | `.github/workflows/rollback.yml`                     |
| Monitoring          | Sentry error tracking, structured logging              | `lib/sentry.ts`, `lib/logger.ts`                     |
| Alerting            | Sentry alerts, Cloudflare analytics                    | `terraform/cloudflare/sentry-alerts.tf`              |
| Log shipping        | Tail Worker to R2 durable storage                      | `workers/log-shipper/`, deploy.yml log-shipper steps |

## CC6.7 — Change Management

| Control          | Implementation                              | Evidence                                    |
| ---------------- | ------------------------------------------- | ------------------------------------------- |
| Code review      | CODEOWNERS, required PR reviews             | `.github/CODEOWNERS`                        |
| Migration safety | Rollback notes required, staging validation | `scripts/check-migrations.sh`, deploy.yml   |
| Feature flags    | Per-site feature toggles                    | `config/sites/`, `lib/dal/feature-flags.ts` |
| Release process  | Documented release checklist                | `docs/release-process.md`                   |

## CC7.2 — Security Incident Management

| Control                | Implementation              | Evidence                                                       |
| ---------------------- | --------------------------- | -------------------------------------------------------------- |
| Incident response plan | Documented runbook          | `docs/incident-response.md`                                    |
| Panic button           | Emergency site pause script | `scripts/panic.sh`                                             |
| Audit logging          | Immutable audit_log table   | `lib/audit-log.ts`, migration creating audit_log               |
| DR drill               | Automated restore test      | `scripts/dr-restore-test.sh`, `.github/workflows/dr-drill.yml` |

## CC8.1 — Risk Assessment

| Control             | Implementation                           | Evidence                                                        |
| ------------------- | ---------------------------------------- | --------------------------------------------------------------- |
| Threat model        | Documented threat model                  | `docs/threat-model.md`                                          |
| Dependency scanning | npm audit, Dependabot, dependency review | `.github/workflows/security.yml`, `.github/dependabot.yml`      |
| SAST                | CodeQL + Semgrep                         | `.github/workflows/codeql.yml`, `.github/workflows/semgrep.yml` |
| Secret scanning     | Gitleaks + GitHub native                 | `.github/workflows/security.yml`                                |
| SBOM generation     | CycloneDX in CI                          | `.github/workflows/ci.yml`, `.github/workflows/sbom.yml`        |

## CC9.1 — Vendor Management

| Control                 | Implementation         | Evidence                |
| ----------------------- | ---------------------- | ----------------------- |
| Vendor inventory        | DPA tracking           | `docs/vendor-dpas.md`   |
| Data processing records | ROPA                   | `docs/ropa.md`          |
| Cost model              | Evidence pack template | `docs/evidence-pack.md` |

## A1.2 — Data Integrity and Availability

| Control          | Implementation                           | Evidence                                           |
| ---------------- | ---------------------------------------- | -------------------------------------------------- |
| Backup policy    | Documented strategy                      | `docs/BACKUP-POLICY.md`, `docs/backup-strategy.md` |
| Backup testing   | DR drill workflow                        | `.github/workflows/dr-drill.yml`                   |
| Data retention   | Automated GDPR retention cron            | `app/api/cron/data-retention/route.ts`             |
| RLS enforcement  | Every tenant table has RLS, CI-verified  | `scripts/db-audit.sh`, CI db-audit job             |
| Tenant isolation | Service-role allowlist, DAL site scoping | `lib/security/service-role-allowlist.ts`           |

## P1.1 — Privacy

| Control           | Implementation                     | Evidence                                          |
| ----------------- | ---------------------------------- | ------------------------------------------------- |
| Data minimization | Email hashing in rate-limit keys   | `lib/validate-email.ts` `hashEmailForRateLimit()` |
| Data erasure      | Privacy API for user data deletion | `app/api/admin/privacy/user/route.ts`             |
| ROPA              | Documented processing activities   | `docs/ropa.md`                                    |
| Cookie consent    | Consent management                 | `lib/cookie-utils.ts`                             |

---

## Evidence Collection Cadence

| Frequency | Activity                                                 |
| --------- | -------------------------------------------------------- |
| Per PR    | CI gates, CodeQL, Semgrep, dependency review             |
| Weekly    | Security workflow (npm audit, gitleaks), CodeQL schedule |
| Monthly   | Secret rotation review, access recertification           |
| Quarterly | DR drill, vendor review, evidence pack refresh           |
| Annually  | Full SOC 2 evidence collection, pentest                  |
