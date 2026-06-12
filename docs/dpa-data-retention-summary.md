# DPA, Data Retention, and Privacy Policy Summary

> **Due Diligence Artifact**
> **Last Updated:** 2026-06-12
> **Purpose:** Gather DPA, data-retention, and privacy policy documentation for due diligence

## Data Processing Agreements (DPAs)

### Status: ✅ Documented

All vendor DPAs are documented in `docs/vendor-dpas.md` with the following coverage:

| Vendor       | DPA Status                  | Link                                                                  | Last Verified |
| ------------ | --------------------------- | --------------------------------------------------------------------- | ------------- |
| Cloudflare   | Executed (SCCs)             | [Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/) | 2026-05-15    |
| Supabase     | Executed (Enterprise)       | [Supabase DPA](https://supabase.com/dpa)                              | 2026-05-15    |
| Stripe       | Standard Services Agreement | [Stripe Privacy Center](https://stripe.com/privacy)                   | 2026-05-15    |
| Resend       | Executed                    | [Resend DPA](https://resend.com/legal/dpa)                            | 2026-05-15    |
| Sentry       | Executed                    | [Sentry DPA](https://sentry.io/legal/dpa/)                            | 2026-05-15    |
| GitHub       | Executed (SCCs)             | GitHub Terms of Service                                               | 2026-05-15    |
| PagerDuty    | Executed (SCCs)             | PagerDuty Terms of Service                                            | 2026-05-15    |
| AI Providers | Varied                      | See vendor-specific links below                                       | 2026-05-15    |

### AI Provider DPAs

| Provider        | DPA Status                           | Link                                                                        |
| --------------- | ------------------------------------ | --------------------------------------------------------------------------- |
| Cloudflare AI   | Executed (via Cloudflare DPA)        | [Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/)       |
| Google (Gemini) | Accepted under Google APIs ToS       | [Google Cloud DPA](https://cloud.google.com/terms/data-processing-addendum) |
| Groq            | Standard ToS (custom DPA on request) | [Groq Privacy Policy](https://groq.com/privacy-policy/)                     |
| Cohere          | Signed DPA on file for paid plans    | [Cohere DPA](https://cohere.com/data-processing-agreement)                  |

---

## Data Residency

### Status: ✅ Documented

Data residency is documented in `docs/data-residency.md` with the following processing locations:

| Service         | Provider               | Region                     | Data Type                         | GDPR Basis                    | Transfer Mechanism         |
| --------------- | ---------------------- | -------------------------- | --------------------------------- | ----------------------------- | -------------------------- |
| Database        | Supabase               | `eu-central-1` (Frankfurt) | All PII, content, analytics       | Adequacy (EU)                 | N/A (EU-resident)          |
| Edge Compute    | Cloudflare Workers     | Global (anycast)           | Request processing, rate limiting | Legitimate interest + DLS     | DPA + SCC (Module 2)       |
| Object Storage  | Cloudflare R2          | Auto (nearest region)      | Images, SBOM, logs                | Legitimate interest           | DPA + SCC (Module 2)       |
| KV Store        | Cloudflare KV          | Global (replicated)        | Rate limit counters, cache        | No PII stored                 | N/A (no PII)               |
| Durable Objects | Cloudflare             | Global (routed)            | Atomic rate limit state           | No PII stored                 | N/A (no PII)               |
| Email           | Resend                 | US (AWS)                   | Email addresses, content          | Consent (newsletter)          | SCC (Module 2) + TIA       |
| Payments        | Stripe                 | Global                     | Payment data (PCI scope)          | Contract (payment processing) | EU-US DPF + SCC (Module 2) |
| AI Providers    | Cloudflare/Google/Groq | Various                    | Content prompts (no PII)          | Legitimate interest           | SCC (Module 2) + TIA       |
| Error Tracking  | Sentry                 | US (GCP)                   | Stack traces, request metadata    | Legitimate interest           | SCC (Module 2) + TIA       |
| CI/CD           | GitHub Actions         | US                         | Source code, build artifacts      | Contract                      | EU-US DPF + SCC (Module 2) |

### PII Data Flow

```
User Browser
    ↓ HTTPS (TLS 1.3)
Cloudflare Edge (global)
    ↓ [No PII cached at edge — KV stores only counters/flags]
Next.js API Route
    ↓ [PII processed in-memory only]
Supabase PostgreSQL (eu-central-1)
    ↓ [PII encrypted at rest — AES-256]
    ↓ [PII redacted in audit logs — see lib/audit-log.ts]
```

---

## Data Retention

### Database (Supabase)

| Setting               | Value                                           | Source                   |
| --------------------- | ----------------------------------------------- | ------------------------ |
| Region                | EU (Frankfurt, `eu-central-1`)                  | `docs/data-residency.md` |
| Encryption at rest    | AES-256 (AWS RDS default)                       | `docs/data-residency.md` |
| Encryption in transit | TLS 1.2+ required                               | `docs/data-residency.md` |
| Backups               | Daily automated + PITR (7-day retention on Pro) | `docs/data-residency.md` |
| RLS                   | Row-Level Security enforces tenant isolation    | `docs/data-residency.md` |

### R2 Storage

| Setting          | Value                                | Source                                 |
| ---------------- | ------------------------------------ | -------------------------------------- |
| Versioning       | Enabled                              | `docs/runbooks/db-backup-retention.md` |
| Lifecycle Rule   | Keep 30 days of overwritten versions | `docs/runbooks/db-backup-retention.md` |
| Retention Window | 30 days                              | `docs/runbooks/db-backup-retention.md` |
| Cross-Region     | Multi-region by default              | `docs/runbooks/db-backup-retention.md` |

---

## GDPR Compliance

### Status: ✅ Documented

GDPR compliance controls are documented in `docs/data-residency.md`:

| Requirement                | Implementation                                                        |
| -------------------------- | --------------------------------------------------------------------- |
| Data minimization          | Click fingerprints are privacy-preserving (24h hash, no raw IP)       |
| Right to erasure           | `app/api/admin/privacy/user/route.ts` — user data deletion            |
| Right to restriction       | `app/api/admin/privacy/restrict/route.ts` — processing restriction    |
| Data portability           | Export via admin API                                                  |
| Consent management         | Cookie consent CMP (`app/(public)/components/cookie-consent-cmp.tsx`) |
| Breach notification        | `docs/breach-notification-templates.md`                               |
| Records of processing      | `docs/ropa.md` (Records of Processing Activities)                     |
| Transfer impact assessment | `docs/schrems-ii-tia.md`                                              |

---

## EU-US Data Privacy Framework (DPF)

### Status: ✅ Documented

DPF certification status is documented in `docs/vendor-dpas.md`:

| Sub-processor | DPF Certified? | SCCs? | Evidence Expiry |
| ------------- | -------------- | ----- | --------------- |
| Cloudflare    | Yes            | Yes   | 2027-03-31      |
| Supabase      | Yes            | Yes   | 2027-01-31      |
| Stripe        | Yes            | N/A   | 2027-06-30      |
| GitHub        | Yes            | Yes   | 2027-03-31      |
| Resend        | Pending        | Yes   | —               |
| Sentry        | Yes            | Yes   | 2027-02-28      |
| PagerDuty     | Yes            | Yes   | 2027-04-30      |

### Action Items

- [ ] Verify Resend DPF certification
- [ ] Verify Groq DPF certification or execute custom DPA
- [ ] Verify Cohere DPF certification or execute custom DPA
- [ ] Schedule quarterly re-verification (next: 2026-08-15)

---

## Vendor Criticality Tiers

### Status: ✅ Documented

Vendors are classified into four tiers in `docs/vendor-dpas.md`:

- **Tier 1 — Mission Critical:** Outage causes complete platform downtime or exposure of core database. High DPA/Security scrutiny required. Quarterly review.
- **Tier 2 — Important:** Outage degrades user experience or stops non-critical business processes. Moderate scrutiny. Semi-annual review.
- **Tier 3 — Supporting:** Outage is largely invisible to users or has manual workarounds. Basic ToS/Privacy review. Annual review.
- **Tier 4 — Informational:** Vendor has no access to customer data or platform operations. Basic ToS review only. Annual review.

| Sub-processor | Tier   | SOC 2 / ISO 27001          | Last verified |
| ------------- | ------ | -------------------------- | ------------- |
| Cloudflare    | Tier 1 | SOC 2 Type II + ISO 27001  | 2026-05-15    |
| Supabase      | Tier 1 | SOC 2 Type II              | 2026-05-15    |
| Stripe        | Tier 1 | SOC 2 Type II + PCI DSS L1 | 2026-05-15    |
| GitHub        | Tier 1 | SOC 2 Type II + ISO 27001  | 2026-05-15    |
| Resend        | Tier 2 | SOC 2 Type II (pending)    | 2026-05-15    |
| Sentry        | Tier 2 | SOC 2 Type II              | 2026-05-15    |
| AI Providers  | Tier 2 | Varies by provider         | 2026-05-15    |
| PagerDuty     | Tier 2 | SOC 2 Type II + ISO 27001  | 2026-05-15    |

---

## Vendor Exit Plans

### Status: ✅ Documented

Exit plans for Tier 1 vendors are documented in `docs/vendor-dpas.md`:

| Vendor     | Lock-in Risk                                              | Alternative Providers                                                       | Data Return                                                         | Migration Path                                                                                              | Last Tested                       |
| ---------- | --------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Cloudflare | Workers runtime, KV, R2, Queues                           | AWS CloudFront + Lambda@Edge, Vercel Edge Functions, Fastly Compute         | R2 exportable via S3 API; KV exportable via REST API                | Rebuild Worker to Node.js; swap KV → DynamoDB/Upstash Redis; swap R2 → S3 (2–4 weeks)                       | Not yet tested (schedule 2026-Q3) |
| Supabase   | Managed PostgreSQL + Auth + RLS                           | AWS RDS PostgreSQL + custom auth, Neon, PlanetScale, self-hosted PostgreSQL | Full `pg_dump` export; PITR backups downloadable                    | `pg_dump` → `pg_restore` to any PostgreSQL host; rewrite Supabase Auth calls (1–2 weeks DB, 2–3 weeks auth) | Not yet tested (schedule 2026-Q3) |
| Stripe     | Payment processing API, subscription billing, webhooks    | Paddle, Lemon Squeezy, Braintree, Adyen                                     | Full data export via Dashboard or API; PCI-scoped data non-portable | Re-integrate payment API; migrate active subscriptions via parallel-run (3–4 weeks)                         | Not yet tested (schedule 2026-Q3) |
| GitHub     | Git hosting, Actions CI/CD, CODEOWNERS, branch protection | GitLab, Bitbucket, Gitea (self-hosted)                                      | `git clone --mirror` captures full history                          | Mirror repo; rewrite CI workflows; migrate issue tracker (1–2 weeks)                                        | Not yet tested (schedule 2026-Q3) |

---

## Blind Spots (Information Not Available in Codebase)

The following DPA/data-retention information is not documented in the codebase and must be obtained from external sources:

- **Signed DPA copies** - Links to DPAs are provided, but signed copies are not in the repo
- **DPA execution dates** - Exact dates when each DPA was signed
- **Data retention schedules** - Specific retention periods for different data types (beyond backups)
- **Privacy policy URL** - Public-facing privacy policy URL for the platform
- **Cookie policy** - Public-facing cookie policy documentation
- **Data subject access request (DSAR) process** - How users can request their data
- **Breach notification history** - Past data breach incidents and responses
- **Third-party data sharing** - List of third parties with whom data is shared
- **Cross-border transfer logs** - Evidence of cross-border data transfers

---

## Required Actions

1. **Obtain signed DPA copies** - Store signed DPA copies in a secure location (not in public repo)
2. **Document DPA execution dates** - Record when each DPA was signed
3. **Create public privacy policy** - Publish a privacy policy for the platform
4. **Create cookie policy** - Publish a cookie policy for the platform
5. **Document DSAR process** - Create a process for data subject access requests
6. **Verify DPF certifications** - Complete pending DPF verifications (Resend, Groq, Cohere)
7. **Test data export paths** - Schedule and execute data export tests for Tier 1 vendors (2026-Q3)
8. **Schedule quarterly reviews** - Set calendar reminders for DPA and SOC 2 evidence renewals

---

## References

- `docs/vendor-dpas.md` - Complete DPA register and vendor management
- `docs/data-residency.md` - Data processing locations and GDPR compliance
- `docs/schrems-ii-tia.md` - Transfer Impact Assessment for EU-US transfers
- `docs/ropa.md` - Records of Processing Activities
- `docs/breach-notification-templates.md` - Breach notification procedures
