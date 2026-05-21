# SOC 2 Controls Mapping

> **OF-16:** Full CC1–CC9, PI1, A1, C1, and P1–P8 mapping.
> Last updated: 2026-05-01. Owner: Security / DPO.

---

## Common Criteria (CC)

### CC1 — Control Environment

| Sub-criterion | Description                  | Evidence                                                         | Owner  | Status         |
| ------------- | ---------------------------- | ---------------------------------------------------------------- | ------ | -------------- |
| CC1.1         | Integrity and ethical values | `docs/code-of-conduct.md`; employee handbook                     | People | ✅             |
| CC1.2         | Board oversight              | Quarterly security review minutes; CEO sign-off on risk register | CEO    | 🔄 In progress |
| CC1.3         | Organisational structure     | Org chart in HR system; RBAC roles in `config/rbac/roles.json`   | People | ✅             |
| CC1.4         | Commitment to competence     | Role-based training records; security awareness training log     | People | 🔄 In progress |
| CC1.5         | Accountability               | `config/rbac/roles.json`; `tools/sod-check.ts` SoD gate in CI    | Sec    | ✅             |

### CC2 — Communication and Information

| Sub-criterion | Description            | Evidence                                                            | Owner  | Status |
| ------------- | ---------------------- | ------------------------------------------------------------------- | ------ | ------ |
| CC2.1         | Internal communication | Slack #engineering + #security channels; incident runbook           | People | ✅     |
| CC2.2         | External communication | Privacy policy; `docs/accessibility-statement.md`; security.txt     | Legal  | ✅     |
| CC2.3         | Reporting obligations  | GDPR 72-hour breach notification SOP in `docs/incident-response.md` | DPO    | ✅     |

### CC3 — Risk Assessment

| Sub-criterion | Description             | Evidence                                                 | Owner | Status |
| ------------- | ----------------------- | -------------------------------------------------------- | ----- | ------ |
| CC3.1         | Risk assessment process | `docs/risk-register.md`; quarterly review cadence        | Sec   | ✅     |
| CC3.2         | Fraud risk              | `docs/threat-model.md` §4; rate-limiting + CSRF controls | Sec   | ✅     |
| CC3.3         | Change risk             | PR review policy (2 approvals); SBOM check in CI         | Eng   | ✅     |

### CC4 — Monitoring Activities

| Sub-criterion | Description           | Evidence                                                                     | Owner | Status |
| ------------- | --------------------- | ---------------------------------------------------------------------------- | ----- | ------ |
| CC4.1         | Ongoing monitoring    | Cloudflare SLO burn-rate alerts (`alerts.tf`); Sentry error rate             | SRE   | ✅     |
| CC4.2         | Deficiency evaluation | Audit findings in `docs/technical-audit-2026-04-30.md`; remediation tracking | Sec   | ✅     |

### CC5 — Control Activities

| Sub-criterion | Description         | Evidence                                                           | Owner | Status |
| ------------- | ------------------- | ------------------------------------------------------------------ | ----- | ------ |
| CC5.1         | Control selection   | This document + IaC                                                | Sec   | ✅     |
| CC5.2         | Technology controls | WAF (Cloudflare), RLS (Supabase), CSP headers                      | Eng   | ✅     |
| CC5.3         | Policy deployment   | Branch protection (`terraform/github/main.tf`); required CI checks | Eng   | ✅     |

### CC6 — Logical and Physical Access

| Sub-criterion | Description               | Evidence                                                            | Owner  | Status         |
| ------------- | ------------------------- | ------------------------------------------------------------------- | ------ | -------------- |
| CC6.1         | Access controls           | Supabase Auth + RLS; `config/rbac/roles.json`; `tools/sod-check.ts` | Sec    | ✅             |
| CC6.2         | New access provisioning   | Onboarding checklist; RBAC role assignment via admin UI             | People | 🔄 In progress |
| CC6.3         | Access removal            | Offboarding checklist; revoke Cloudflare + Supabase tokens          | People | 🔄 In progress |
| CC6.6         | Logical access boundaries | VPC-less; Cloudflare Zero Trust for admin paths                     | Sec    | ✅             |
| CC6.7         | Transmission protection   | TLS 1.3 enforced; HSTS; CSP                                         | Eng    | ✅             |
| CC6.8         | Malware prevention        | Dependabot + CodeQL + dep-review in CI; SBOM attestation            | Eng    | ✅             |

### CC7 — System Operations

| Sub-criterion | Description               | Evidence                                                      | Owner | Status |
| ------------- | ------------------------- | ------------------------------------------------------------- | ----- | ------ |
| CC7.1         | Infrastructure monitoring | Cloudflare analytics + Workers metrics; `docs/observability/` | SRE   | ✅     |
| CC7.2         | Anomaly detection         | SLO burn-rate alerts; Sentry; WAF anomaly rules               | SRE   | ✅     |
| CC7.3         | Incident response         | `docs/incident-response.md`; `docs/templates/postmortem.md`   | Sec   | ✅     |
| CC7.4         | Incident identification   | Sentry + structured logger → R2 log bucket                    | SRE   | ✅     |
| CC7.5         | Remediation               | Postmortem process; fix-forward deploy pipeline               | Eng   | ✅     |

### CC8 — Change Management

| Sub-criterion | Description          | Evidence                                     | Owner | Status |
| ------------- | -------------------- | -------------------------------------------- | ----- | ------ |
| CC8.1         | Change authorisation | 2-reviewer PRs; branch protection; CHANGELOG | Eng   | ✅     |

### CC9 — Risk Mitigation

| Sub-criterion | Description         | Evidence                                       | Owner | Status         |
| ------------- | ------------------- | ---------------------------------------------- | ----- | -------------- |
| CC9.1         | Vendor risk         | `docs/vendor-dpas.md`; quarterly vendor review | Sec   | ✅             |
| CC9.2         | Business continuity | `docs/disaster-recovery.md`; Supabase PITR     | SRE   | 🔄 In progress |

---

## Additional Criteria

### PI1 — Processing Integrity

| Sub-criterion | Description                      | Evidence                                                             | Owner | Status |
| ------------- | -------------------------------- | -------------------------------------------------------------------- | ----- | ------ |
| PI1.1         | Complete and accurate processing | Integration tests (`tests/integration/`); idempotency keys on Stripe | Eng   | ✅     |
| PI1.2         | Authorised processing only       | RLS policies; `withAuthz()` middleware on all admin routes           | Eng   | ✅     |

### A1 — Availability

| Sub-criterion | Description               | Evidence                                               | Owner | Status         |
| ------------- | ------------------------- | ------------------------------------------------------ | ----- | -------------- |
| A1.1          | Capacity management       | Cloudflare Workers auto-scale; `docs/slo.md` 99.9% SLO | SRE   | ✅             |
| A1.2          | Environmental protections | Cloudflare DDoS protection; WAF rate limiting          | SRE   | ✅             |
| A1.3          | Recovery                  | Supabase PITR (7-day); `docs/disaster-recovery.md`     | SRE   | 🔄 In progress |

### C1 — Confidentiality

| Sub-criterion | Description                             | Evidence                                                    | Owner | Status |
| ------------- | --------------------------------------- | ----------------------------------------------------------- | ----- | ------ |
| C1.1          | Confidential information identification | Data classification in `docs/data-classification.md`        | Sec   | ✅     |
| C1.2          | Disposal                                | `erase_subject_data` RPC (GDPR Art. 17); R2 lifecycle rules | Eng   | ✅     |

### P1–P8 — Privacy

| Sub-criterion | Description                          | Evidence                                                   | Owner | Status         |
| ------------- | ------------------------------------ | ---------------------------------------------------------- | ----- | -------------- |
| P1.1          | Privacy notice                       | Privacy policy (`app/(public)/privacy/page.tsx`)           | DPO   | ✅             |
| P2.1          | Choice and consent                   | Consent banner (vanilla-cookieconsent); `/api/consent/log` | Eng   | ✅             |
| P3.1          | Collection limited to stated purpose | RoPA in `docs/compliance-readiness.md`                     | DPO   | ✅             |
| P4.1          | Use limited to stated purpose        | AI prompt sanitisation; no cross-purpose reuse             | Eng   | ✅             |
| P5.1          | Retention and disposal               | `docs/data-retention.md`; DSAR erasure RPC                 | DPO   | ✅             |
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
