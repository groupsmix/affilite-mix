# Vendor DPAs and Data Residency (Acquisition Evidence)

This document serves as the formal register of Data Processing Agreements (DPAs) and data residency commitments for the Affilite-Mix platform infrastructure, fulfilling GDPR/SOC2 vendor management controls.

## 1. Cloudflare (Edge Network & Compute)

- **Role:** CDN, WAF, DNS, Edge Compute (Workers), KV Storage, Queues.
- **Data Residency:** Data is processed globally at the edge. However, Cloudflare's **Data Localization Suite** is utilized to ensure logs and specific metadata do not leave the EU region.
- **DPA Status:** Executed. Standard Contractual Clauses (SCCs) are in place.
- **Link:** [Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/)

## 2. Supabase (Database & Auth)

- **Role:** Managed PostgreSQL Database, Authentication, Row Level Security.
- **Data Residency:** Deployed to AWS `eu-central-1` (Frankfurt). All at-rest database backups and PITR logs reside in the EU.
- **DPA Status:** Executed via Enterprise contract.
- **Link:** [Supabase DPA](https://supabase.com/dpa)

## 3. Stripe (Payments)

- **Role:** Payment processing and subscription management.
- **Data Residency:** Global processing. Stripe acts as an independent data controller for payment information.
- **DPA Status:** Accepted under standard Stripe Services Agreement.
- **Link:** [Stripe Privacy Center](https://stripe.com/privacy)

## 4. Resend (Email Delivery)

- **Role:** Transactional and newsletter email delivery.
- **Data Residency:** Hosted primarily in AWS US-East. Email addresses and body contents traverse US boundaries.
- **DPA Status:** Executed.
- **Link:** [Resend DPA](https://resend.com/legal/dpa)

## 5. Sentry (Error Tracking & Telemetry)

- **Role:** Application performance monitoring and crash reporting.
- **Data Residency:** Sentry SaaS (US region).
- **Mitigating Controls:** Aggressive PII scrubbing (IP addresses, cookies, user emails) is configured locally in `sentry.client.config.ts`, `sentry.server.config.ts`, and `sentry.edge.config.ts` prior to payload transmission.
- **DPA Status:** Executed.
- **Link:** [Sentry DPA](https://sentry.io/legal/dpa/)

## 6. AI Providers (Generative Text)

The platform routes every generative AI call through a fallback chain defined in `lib/ai/providers.ts`. The providers below are the ground truth for DPA / vendor management; the order matches the runtime fallback sequence. Cloudflare AI is already covered under §1 and is listed here only for completeness.

### 6a. Cloudflare AI (primary)

- **Role:** Primary text-generation provider (`@cf/meta/llama-3.1-8b-instruct`) invoked from `lib/ai/content-generator.ts`.
- **Data Residency:** Served from Cloudflare's edge network; covered by the §1 Cloudflare DPA and Data Localization Suite.
- **DPA Status:** Executed (see §1).
- **Link:** [Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/)

### 6b. Google (Gemini API)

- **Role:** Fallback text-generation provider (`gemini-1.5-flash`). Enabled only when `AI_ENABLE_GEMINI=true` AND `GEMINI_API_KEY` is set.
- **Data Residency:** Global processing under the Google Cloud region routing for Generative Language API. No EU pinning is offered on the free tier.
- **Mitigating Controls:** No PII is sent in prompts — see `lib/ai/content-generator.ts` (`SYSTEM_PROMPTS`) and the guardrails in `docs/ai-governance.md`. Control-token and length sanitization in `lib/ai/prompt-sanitization.ts` runs before every upstream call.
- **DPA Status:** Accepted under the Google APIs Terms of Service (`https://developers.generativeai.google/terms`). No custom DPA.
- **Link:** [Google Cloud DPA](https://cloud.google.com/terms/data-processing-addendum)

### 6c. Groq

- **Role:** Secondary fallback provider (`llama-3.1-8b-instant`). Enabled only when `AI_ENABLE_GROQ=true` AND `GROQ_API_KEY` is set.
- **Data Residency:** Global processing; Groq does not currently offer regional pinning.
- **Mitigating Controls:** Same no-PII prompt construction and sanitization pipeline as Gemini.
- **DPA Status:** Accepted under Groq's standard Terms of Service; custom DPA on request.
- **Link:** [Groq Privacy Policy](https://groq.com/privacy-policy/)

### 6d. Cohere

- **Role:** Last-resort fallback provider (`command-r`). Enabled only when `AI_ENABLE_COHERE=true` AND `COHERE_API_KEY` is set.
- **Data Residency:** Global processing on Cohere-managed infrastructure.
- **Mitigating Controls:** Same no-PII prompt construction and sanitization pipeline as Gemini.
- **DPA Status:** Accepted under Cohere's Commercial Terms of Service; signed DPA on file for paid plans.
- **Link:** [Cohere DPA](https://cohere.com/data-processing-agreement)

> **Note:** The platform does **not** use OpenAI, Anthropic, or any image-generation provider. Comment moderation runs through the rule-based pipeline in `lib/security/` and is not an AI call. See `docs/ai-governance.md` for the full governance narrative and guardrails.

## 7. EU-US Data Privacy Framework (DPF) Certification Status

Per Schrems II (CJEU C-311/18) and the EU-US DPF Adequacy Decision (July 2023), US-based sub-processors should be verified at [dataprivacyframework.gov](https://www.dataprivacyframework.gov).

## Vendor Criticality Tiers (A171)

To comply with internal risk management and procurement policies, vendors are classified into four tiers:

- **Tier 1 — Mission Critical:** Outage causes complete platform downtime or exposure of core database. High DPA/Security scrutiny required. Quarterly review.
- **Tier 2 — Important:** Outage degrades user experience or stops non-critical business processes (e.g., newsletter). Moderate scrutiny. Semi-annual review.
- **Tier 3 — Supporting:** Outage is largely invisible to users or has manual workarounds. Basic ToS/Privacy review. Annual review.
- **Tier 4 — Informational:** Vendor has no access to customer data or platform operations. Basic ToS review only. Annual review.

| Sub-processor | Tier   | DPF Certified? | SCCs? | SOC 2 / ISO 27001          | Evidence Expiry | Sub-processor List                                                                                | Breach-Notification SLA      | Last verified |
| ------------- | ------ | -------------- | ----- | -------------------------- | --------------- | ------------------------------------------------------------------------------------------------- | ---------------------------- | ------------- |
| Cloudflare    | Tier 1 | Yes            | Yes   | SOC 2 Type II + ISO 27001  | 2027-03-31      | [CF Sub-processors](https://www.cloudflare.com/cloudflare-sub-processors/)                        | 72 hours (DPA §7.3)          | 2026-05-15    |
| Supabase      | Tier 1 | Yes            | Yes   | SOC 2 Type II              | 2027-01-31      | [Supabase Sub-processors](https://supabase.com/legal/subprocessors)                               | 48 hours (Enterprise DPA §6) | 2026-05-15    |
| Stripe        | Tier 1 | Yes            | N/A   | SOC 2 Type II + PCI DSS L1 | 2027-06-30      | [Stripe Sub-processors](https://stripe.com/legal/service-providers)                               | 72 hours (DPA §4.4)          | 2026-05-15    |
| GitHub        | Tier 1 | Yes            | Yes   | SOC 2 Type II + ISO 27001  | 2027-03-31      | [GH Sub-processors](https://docs.github.com/en/site-policy/privacy-policies/github-subprocessors) | 72 hours (DPA §7)            | 2026-05-15    |
| Resend        | Tier 2 | Pending        | Yes   | SOC 2 Type II (pending)    | —               | Not published                                                                                     | 72 hours (DPA §5)            | 2026-05-15    |
| Sentry        | Tier 2 | Yes            | Yes   | SOC 2 Type II              | 2027-02-28      | [Sentry Sub-processors](https://sentry.io/legal/subprocessors/)                                   | 72 hours (DPA §6)            | 2026-05-15    |
| AI Providers  | Tier 2 | Varied         | Yes   | Varies by provider         | —               | See §6a–6d above                                                                                  | Varies (see ToS)             | 2026-05-15    |
| PagerDuty     | Tier 2 | Yes            | Yes   | SOC 2 Type II + ISO 27001  | 2027-04-30      | [PD Sub-processors](https://www.pagerduty.com/sub-processors/)                                    | 48 hours (DPA §5.2)          | 2026-05-15    |

**Action items:**

- [ ] Verify Resend DPF certification
- [ ] Verify Groq DPF certification or execute custom DPA
- [ ] Verify Cohere DPF certification or execute custom DPA
- [ ] Obtain and file Resend SOC 2 report when available
- [ ] Schedule quarterly re-verification (next: 2026-08-15)
- [ ] Set calendar reminders for SOC 2 / ISO evidence renewals per expiry dates above

See also: `docs/schrems-ii-tia.md` for the full Transfer Impact Assessment.

---

## Vendor Exit Plans (A172)

For each Tier 1 vendor (single points of failure), the following exit plans document alternatives, data-return procedures, and tested export paths.

### Cloudflare (Edge / CDN / Workers)

- **Lock-in risk:** Workers runtime API, KV, R2, Queues are Cloudflare-proprietary.
- **Alternative providers:** AWS CloudFront + Lambda@Edge, Vercel Edge Functions, Fastly Compute.
- **Data return:** R2 objects exportable via S3-compatible API (`aws s3 sync`). KV exportable via REST API bulk read. DNS zone exportable via AXFR or API.
- **Migration path:** Rebuild Worker to Node.js runtime; swap KV → DynamoDB/Upstash Redis; swap R2 → S3. Estimated effort: 2–4 weeks.
- **Last tested data export:** Not yet tested. Schedule first test by 2026-Q3.

### Supabase (Database / Auth)

- **Lock-in risk:** Managed PostgreSQL + Auth + RLS. Core data is standard PostgreSQL.
- **Alternative providers:** AWS RDS PostgreSQL + custom auth, Neon, PlanetScale (MySQL), self-hosted PostgreSQL.
- **Data return:** Full `pg_dump` export available via direct connection string. PITR backups downloadable. Auth user table exportable via SQL.
- **Migration path:** `pg_dump` → `pg_restore` to any PostgreSQL host. Rewrite Supabase Auth calls to custom JWT middleware. Estimated effort: 1–2 weeks for DB, 2–3 weeks for auth.
- **Last tested data export:** Not yet tested. Schedule first test by 2026-Q3.

### Stripe (Payments)

- **Lock-in risk:** Payment processing API, subscription billing, webhook integrations.
- **Alternative providers:** Paddle, Lemon Squeezy, Braintree, Adyen.
- **Data return:** Full data export via Stripe Dashboard (CSV) or API (`/v1/charges`, `/v1/subscriptions`, `/v1/customers`). PCI-scoped data (card tokens) is non-portable.
- **Migration path:** Re-integrate payment API; migrate active subscriptions via parallel-run. Estimated effort: 3–4 weeks.
- **Last tested data export:** Not yet tested. Schedule first test by 2026-Q3.

### GitHub (Source Code / CI)

- **Lock-in risk:** Git hosting, Actions CI/CD, CODEOWNERS, branch protection rules.
- **Alternative providers:** GitLab, Bitbucket, Gitea (self-hosted).
- **Data return:** `git clone --mirror` captures full history. Actions workflows require rewrite for target CI. Issues/PRs exportable via API.
- **Migration path:** Mirror repo; rewrite CI workflows; migrate issue tracker. Estimated effort: 1–2 weeks.
- **Last tested data export:** Not yet tested. Schedule first test by 2026-Q3.
