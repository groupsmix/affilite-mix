# SOC 2 Controls Mapping

> **OF-16:** Full CC1–CC9, PI1, A1, C1, and P1–P8 mapping.
> Last updated: 2026-05-03. Owner: Security / DPO.

---

## Common Criteria (CC)

### CC1 — Control Environment

| Sub-criterion | Description                  | Evidence                                                         | Owner  | Status         |
| ------------- | ---------------------------- | ---------------------------------------------------------------- | ------ | -------------- |
| CC1.1         | Integrity and ethical values | [`CONTRIBUTING.md`](../CONTRIBUTING.md); [`SECURITY.md`](../SECURITY.md); employee handbook (HR system)                        | People | ✅             |
| CC1.2         | Board oversight              | `s3://groupsmix-compliance/soc2/readiness/quarterly-review-minutes/`; CEO sign-off on [`docs/threat-model.md`](threat-model.md) risk register | CEO    | 🔄 In progress |
| CC1.3         | Organisational structure     | Org chart in HR system; [`config/rbac/roles.json`](../config/rbac/roles.json)                                                  | People | ✅             |
| CC1.4         | Commitment to competence     | Role-based training records (HR system); security awareness training log (annual, stored in `s3://groupsmix-compliance/soc2/training/`) | People | 🔄 In progress |
| CC1.5         | Accountability               | [`config/rbac/roles.json`](../config/rbac/roles.json); [`tools/sod-check.ts`](../tools/sod-check.ts) SoD gate in CI; [`docs/sod-matrix.md`](sod-matrix.md) | Sec    | ✅             |

### CC2 — Communication and Information

| Sub-criterion | Description            | Evidence                                                            | Owner  | Status |
| ------------- | ---------------------- | ------------------------------------------------------------------- | ------ | ------ |
| CC2.1         | Internal communication | Slack #engineering + #security channels; [`docs/alerting-runbook.md`](alerting-runbook.md)                              | People | ✅     |
| CC2.2         | External communication | Privacy policy (`app/(public)/privacy/page.tsx`); [`SECURITY.md`](../SECURITY.md) (`/.well-known/security.txt` served) | Legal  | ✅     |
| CC2.3         | Reporting obligations  | GDPR 72-hour breach notification SOP in [`docs/security-incidents.md`](security-incidents.md)                           | DPO    | ✅     |

### CC3 — Risk Assessment

| Sub-criterion | Description             | Evidence                                                 | Owner | Status |
| ------------- | ----------------------- | -------------------------------------------------------- | ----- | ------ |
| CC3.1         | Risk assessment process | [`docs/threat-model.md`](threat-model.md); quarterly review cadence documented in compliance calendar | Sec   | ✅     |
| CC3.2         | Fraud risk              | [`docs/threat-model.md`](threat-model.md) §4; rate-limiting (`middleware.ts`); CSRF via SameSite cookies | Sec   | ✅     |
| CC3.3         | Change risk             | [`terraform/github/branch-protection.tf`](../terraform/github/branch-protection.tf) (2 approvals); SBOM + CodeQL in CI (`.github/workflows/security.yml`) | Eng   | ✅     |

### CC4 — Monitoring Activities

| Sub-criterion | Description           | Evidence                                                                     | Owner | Status |
| ------------- | --------------------- | ---------------------------------------------------------------------------- | ----- | ------ |
| CC4.1         | Ongoing monitoring    | [`terraform/cloudflare/alerts.tf`](../terraform/cloudflare/alerts.tf) (SLO burn-rate); [`terraform/cloudflare/sentry-alerts.tf`](../terraform/cloudflare/sentry-alerts.tf) (error-rate alerts); Sentry dashboard | SRE   | ✅     |
| CC4.2         | Deficiency evaluation | [`docs/technical-audit-2026-04-30.md`](technical-audit-2026-04-30.md); remediation tracking in GitHub Issues                                                                                                     | Sec   | ✅     |

### CC5 — Control Activities

| Sub-criterion | Description         | Evidence                                                           | Owner | Status |
| ------------- | ------------------- | ------------------------------------------------------------------ | ----- | ------ |
| CC5.1         | Control selection   | This document; [`terraform/`](../terraform/) IaC modules                                                                                      | Sec   | ✅     |
| CC5.2         | Technology controls | WAF ([`terraform/cloudflare/main.tf`](../terraform/cloudflare/main.tf)); RLS (`supabase/schema.sql`); CSP headers (`next.config.ts`)          | Eng   | ✅     |
| CC5.3         | Policy deployment   | [`terraform/github/branch-protection.tf`](../terraform/github/branch-protection.tf); required CI checks (`.github/workflows/ci.yml`)         | Eng   | ✅     |

### CC6 — Logical and Physical Access

| Sub-criterion | Description               | Evidence                                                            | Owner  | Status         |
| ------------- | ------------------------- | ------------------------------------------------------------------- | ------ | -------------- |
| CC6.1         | Access controls           | Supabase Auth + RLS; [`config/rbac/roles.json`](../config/rbac/roles.json); [`tools/sod-check.ts`](../tools/sod-check.ts) CI gate | Sec    | ✅             |
| CC6.2         | New access provisioning   | Onboarding checklist (HR); RBAC role assignment via admin UI (`app/(admin)/`)                                                      | People | 🔄 In progress |
| CC6.3         | Access removal            | Offboarding checklist (HR); revoke Cloudflare + Supabase tokens; [`docs/secrets-rotation-runbook.md`](secrets-rotation-runbook.md) | People | 🔄 In progress |
| CC6.6         | Logical access boundaries | Edge-only (no VPC); Cloudflare Zero Trust for admin paths; [`middleware.ts`](../middleware.ts) admin guard                          | Sec    | ✅             |
| CC6.7         | Transmission protection   | TLS 1.3 enforced ([`terraform/cloudflare/main.tf`](../terraform/cloudflare/main.tf)); HSTS; CSP (`next.config.ts`)                 | Eng    | ✅             |
| CC6.8         | Malware prevention        | Dependabot + CodeQL + dep-review (`.github/workflows/security.yml`); SBOM attestation (`.github/workflows/sbom.yml`)               | Eng    | ✅             |

### CC7 — System Operations

| Sub-criterion | Description               | Evidence                                                      | Owner | Status |
| ------------- | ------------------------- | ------------------------------------------------------------- | ----- | ------ |
| CC7.1         | Infrastructure monitoring | Cloudflare Analytics + Workers metrics; [`docs/observability-runbook.md`](observability-runbook.md); Tail Worker log shipping (`workers/log-shipper/`) | SRE   | ✅     |
| CC7.2         | Anomaly detection         | SLO burn-rate alerts ([`terraform/cloudflare/alerts.tf`](../terraform/cloudflare/alerts.tf)); Sentry; WAF anomaly rules                                | SRE   | ✅     |
| CC7.3         | Incident response         | [`docs/security-incidents.md`](security-incidents.md); [`docs/templates/postmortem.md`](templates/postmortem.md)                                        | Sec   | ✅     |
| CC7.4         | Incident identification   | Sentry + structured logger; R2 log bucket via Tail Worker (`workers/log-shipper/`); [`docs/alerting-runbook.md`](alerting-runbook.md)                    | SRE   | ✅     |
| CC7.5         | Remediation               | Postmortem template ([`docs/templates/postmortem.md`](templates/postmortem.md)); fix-forward deploy pipeline (`.github/workflows/deploy.yml`)            | Eng   | ✅     |

### CC8 — Change Management

| Sub-criterion | Description          | Evidence                                     | Owner | Status |
| ------------- | -------------------- | -------------------------------------------- | ----- | ------ |
| CC8.1         | Change authorisation | 2-reviewer PRs ([`terraform/github/branch-protection.tf`](../terraform/github/branch-protection.tf)); [`CHANGELOG.md`](../CHANGELOG.md) | Eng   | ✅     |

### CC9 — Risk Mitigation

| Sub-criterion | Description         | Evidence                                       | Owner | Status         |
| ------------- | ------------------- | ---------------------------------------------- | ----- | -------------- |
| CC9.1         | Vendor risk         | [`docs/vendor-dpas.md`](vendor-dpas.md); [`docs/schrems-ii-tia.md`](schrems-ii-tia.md); quarterly vendor review | Sec   | ✅             |
| CC9.2         | Business continuity | [`docs/backup-strategy.md`](backup-strategy.md); [`docs/cloudflare-recovery.md`](cloudflare-recovery.md); Supabase PITR (7-day) | SRE   | 🔄 In progress |

---

## Additional Criteria

### PI1 — Processing Integrity

| Sub-criterion | Description                      | Evidence                                                             | Owner | Status |
| ------------- | -------------------------------- | -------------------------------------------------------------------- | ----- | ------ |
| PI1.1         | Complete and accurate processing | Integration tests (`__tests__/`); idempotency keys on Stripe; E2E tests (`e2e/`) | Eng   | ✅     |
| PI1.2         | Authorised processing only       | RLS policies (`supabase/schema.sql`); [`lib/admin-guard.ts`](../lib/admin-guard.ts) on all admin routes | Eng   | ✅     |

### A1 — Availability

| Sub-criterion | Description               | Evidence                                               | Owner | Status         |
| ------------- | ------------------------- | ------------------------------------------------------ | ----- | -------------- |
| A1.1          | Capacity management       | Cloudflare Workers auto-scale; [`docs/slo.md`](slo.md) 99.9% SLO; burn-rate alerts in [`terraform/cloudflare/alerts.tf`](../terraform/cloudflare/alerts.tf) | SRE   | ✅             |
| A1.2          | Environmental protections | Cloudflare DDoS protection; WAF rate limiting ([`terraform/cloudflare/main.tf`](../terraform/cloudflare/main.tf))                                            | SRE   | ✅             |
| A1.3          | Recovery                  | Supabase PITR (7-day); [`docs/backup-strategy.md`](backup-strategy.md); [`docs/cloudflare-recovery.md`](cloudflare-recovery.md)                              | SRE   | 🔄 In progress |

### C1 — Confidentiality

| Sub-criterion | Description                             | Evidence                                                    | Owner | Status |
| ------------- | --------------------------------------- | ----------------------------------------------------------- | ----- | ------ |
| C1.1          | Confidential information identification | Data classification in [`docs/compliance-readiness.md`](compliance-readiness.md) RoPA; [`docs/architecture-data-flow.md`](architecture-data-flow.md) | Sec   | ✅     |
| C1.2          | Disposal                                | `erase_subject_data` RPC ([`supabase/migrations/2026050301_erase_subject_data_complete.sql`](../supabase/migrations/2026050301_erase_subject_data_complete.sql)); R2 lifecycle rules ([`terraform/cloudflare/storage.tf`](../terraform/cloudflare/storage.tf)) | Eng   | ✅     |

### P1–P8 — Privacy

| Sub-criterion | Description                          | Evidence                                                   | Owner | Status         |
| ------------- | ------------------------------------ | ---------------------------------------------------------- | ----- | -------------- |
| P1.1          | Privacy notice                       | Privacy policy (`app/(public)/privacy/page.tsx`)           | DPO   | ✅             |
| P2.1          | Choice and consent                   | Consent banner (vanilla-cookieconsent); `/api/consent/log`; [`supabase/migrations/2026050106_consent_log.sql`](../supabase/migrations/2026050106_consent_log.sql) | Eng   | ✅             |
| P3.1          | Collection limited to stated purpose | RoPA in [`docs/compliance-readiness.md`](compliance-readiness.md) §GDPR Art. 30                                                                                  | DPO   | ✅             |
| P4.1          | Use limited to stated purpose        | [`lib/ai/prompt-sanitization.ts`](../lib/ai/prompt-sanitization.ts); [`docs/ai-governance.md`](ai-governance.md); no cross-purpose reuse                          | Eng   | ✅             |
| P5.1          | Retention and disposal               | [`docs/sbom-retention.md`](sbom-retention.md); DSAR erasure RPC (`erase_subject_data`)                                                                            | DPO   | ✅             |
| P6.1          | Access to personal data              | DSAR GET endpoint; subject portal (planned)                | Eng   | 🔄 In progress |
| P7.1          | Quality and accuracy                 | DSAR correction endpoint (planned)                         | Eng   | 🔄 In progress |
| P8.1          | Monitoring and enforcement           | Quarterly GDPR review; DPO oversight                       | DPO   | ✅             |

---

## Legend

| Symbol         | Meaning                                                |
| -------------- | ------------------------------------------------------ |
| ✅             | Evidence exists and is current                         |
| 🔄 In progress | Control partially implemented; gap remediation planned |
| ❌             | Control not yet implemented                            |

---

## Review Schedule

Quarterly review by Security + DPO. Next review: 2026-08-01.
