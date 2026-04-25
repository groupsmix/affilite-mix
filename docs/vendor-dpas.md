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
