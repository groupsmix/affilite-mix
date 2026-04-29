# EV-01: Compliance Evidence Pack

This document tracks the artifacts required for SOC 2 / ISO 27001 readiness.
Each artifact should be collected before the production launch gate review.

## Required Artifacts

### Infrastructure

- [ ] **Cloudflare production environment export** (without secret values)
  - Run `scripts/cf-security-snapshot.sh` and store output in `docs/cloudflare-evidence.md`
  - Must include: zone settings, WAF rules, rate-limit rules, DNS records, Worker bindings

- [ ] **Supabase RLS policies + production schema snapshot**
  - Run `pg_dump --schema-only` against staging after all migrations applied
  - Store as `docs/schema-snapshot.sql`
  - Run `scripts/db-audit.sh` and store RLS policy listing

### CI/CD

- [ ] **Branch-protection / ruleset screenshots**
  - Run `scripts/github-rulesets-snapshot.sh`
  - Capture required status checks, reviewer requirements, merge restrictions

- [ ] **Latest CI run results**
  - Link to passing CI run with lint, typecheck, test, build, audit
  - Include `npm audit` output from `docs/npm-audit-report.txt`

- [ ] **SBOM (Software Bill of Materials)**
  - Generate with `npm sbom --sbom-format cyclonedx` or similar

- [ ] **Dependency / security scan results**
  - `npm audit --json > docs/npm-audit-report.json`
  - Gitleaks report from `docs/gitleaks-report.json`

### Observability

- [ ] **Sentry / logging dashboard screenshots**
  - Alert rules configured per `docs/alerting-runbook.md`
  - Error rate dashboard, latency percentiles

### Backup & DR

- [ ] **Backup + restore test evidence (RTO/RPO)**
  - Run `scripts/dr-restore-test.sh` against staging
  - Document RTO (recovery time) and RPO (data loss window)
  - See `docs/BACKUP-POLICY.md` and `docs/DR-RUNBOOK.md`

### Payments

- [ ] **Stripe webhook + signing config**
  - Webhook endpoint URL and events subscribed
  - Signing secret rotation date
  - Idempotency configuration

### Security

- [ ] **Incident-response runbook + escalation path**
  - See `docs/incident-response.md`
  - Escalation contacts and response SLAs

- [ ] **Privacy / data-retention policy mapped to DB tables**
  - See `purge_retention()` function and `docs/vendor-dpas.md`
  - PII inventory mapped to `erase_user()` RPC (migration 00088)

- [ ] **Admin access review list**
  - List of all admin users, roles, and last-access dates
  - See `docs/access-recertification.md`

### Architecture

- [ ] **Architecture diagram**
  - See `docs/architecture.md` and `docs/architecture-data-flow.md`
  - Must show: CDN layer, Worker, Next.js app, Supabase, R2, queues

## Collection Process

1. Assign an owner for each artifact
2. Collect artifacts into a shared folder (e.g. `evidence/YYYY-MM-DD/`)
3. Review all artifacts in the launch gate meeting
4. Store the complete pack in a versioned, access-controlled location
5. Schedule quarterly re-collection for ongoing compliance
