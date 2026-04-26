# Compliance Evidence Index

Audit item #90.

This document is the canonical map of where evidence lives for our
internal SOC2 / GDPR / CCPA dossiers. Every row is a thing an auditor
will ask for; the link column points at the source-of-truth artefact
inside this repository.

| Control                | Frequency              | Source of truth                                                                                             | Owner         |
| ---------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------- | ------------- |
| Change management      | Per PR                 | GitHub PR + CODEOWNERS approval, CI artefacts                                                               | Engineering   |
| Access recertification | Quarterly              | `docs/access-recertification.md` + completed checklist artefacts in `docs/evidence/access-recert-YYYYQn.md` | Security      |
| Backup verification    | Monthly                | `docs/BACKUP-POLICY.md` + DR drill log in `docs/dr-drill-checklist.md`                                      | Platform      |
| RLS posture            | Per release            | `__tests__/cross-tenant-authz.test.ts` + `supabase/migrations/00067_harden_tenant_isolation_rls.sql`        | Data platform |
| Secret rotation        | Quarterly              | `docs/secrets-rotation-runbook.md` + CRON_SECRET / RESEND / OPENAI rotation log                             | Security      |
| Threat model review    | Yearly                 | `docs/threat-model.md` (top-of-file revision history)                                                       | Security      |
| AI usage governance    | Per change             | `docs/ai-governance.md` + `ai_usage_log` table                                                              | AI council    |
| Vendor DPAs            | At onboarding + yearly | `docs/vendor-dpas.md` + signed PDF in `docs/evidence/dpa/`                                                  | Legal         |
| Incident postmortems   | Per incident           | `docs/incidents/YYYY-MM-DD-<slug>.md`                                                                       | On-call       |
| SLO burn alerts        | Continuous             | `docs/slo.md` + Cloudflare/Sentry dashboards                                                                | Platform      |

## Evidence Storage

- Logs: Cloudflare Logpush → R2 (`logs/YYYY/MM/DD/`), retained 365 days.
- Metrics: Cloudflare Workers Analytics Engine, retained 90 days.
- Audit trail: `audit_log` table, retained indefinitely; quarterly
  exports archived in R2 (`audit-archive/`).
- Tickets / approvals: GitHub PRs + Linear projects (linked from PR
  descriptions).

## Quarterly Evidence Pack

The captain of the quarter (rotates with the on-call) collects:

1. The 13-week change-management report (`scripts/changelog-extract.ts`).
2. The access-recertification artefact for the quarter.
3. The latest DR drill log.
4. The quarter's secret-rotation log.
5. The quarter's incident postmortems.

…and uploads them under `docs/evidence/<quarter>/` with a one-page
summary. The CHANGELOG references the evidence pack tag.
