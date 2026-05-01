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
