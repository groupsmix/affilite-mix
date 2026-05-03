# Vendor Risk Register

> **Audit ref:** A66-F2 (SOC 2 CC9), A67 (ISO 27001 A.5.19-A.5.22)
> **Owner:** Security
> **Review cadence:** Quarterly
> **Last reviewed:** 2026-05-03

---

## Purpose

This register tracks third-party vendors that process, store, or have access to platform data. Each vendor is assessed for risk based on data access, criticality, and compliance posture.

## Risk Scoring

| Score | Level    | Definition                                                    |
|-------|----------|---------------------------------------------------------------|
| 1     | Low      | No PII access; non-critical service; strong compliance posture |
| 2     | Medium   | Limited PII access or moderate criticality                     |
| 3     | High     | Broad PII access, critical to operations, or weak compliance   |

## Vendor Register

| Vendor | Purpose | Data access | Criticality | DPA? | SOC 2/ISO? | Risk score | Notes |
|--------|---------|-------------|-------------|------|------------|------------|-------|
| Supabase | Database hosting | All PII (encrypted at rest) | Critical | Yes | SOC 2 Type II | 3 | EU-pinned (Frankfurt). Primary data store. |
| Cloudflare | CDN, Workers, R2, KV | Transit data, R2 objects | Critical | Yes | SOC 2 Type II, ISO 27001 | 2 | Data Localization Suite available. |
| Stripe | Payment processing | Email, subscription tokens | High | Yes (independent controller) | PCI DSS L1, SOC 2 | 2 | No PAN touches our infra. US-based. |
| Resend | Email delivery | Email addresses, content | Medium | Yes | SOC 2 Type II | 2 | US-based (AWS US-East). |
| Sentry | Error monitoring | Scrubbed breadcrumbs (no PII) | Medium | Yes | SOC 2 Type II | 1 | `sendDefaultPii: false`; PHI scrubbing active. |
| Cloudflare AI | Content generation | Prompts (no PII by design) | Low | Yes (Cloudflare DPA) | SOC 2 | 1 | No PII in prompts; output filtered. |
| Google Gemini | AI fallback | Prompts (no PII by design) | Low | Yes | ISO 27001, SOC 2 | 1 | Fallback only; no PII in prompts. |
| Groq | AI fallback | Prompts (no PII by design) | Low | Yes | SOC 2 Type II | 1 | Fallback only; no PII in prompts. |
| Cohere | AI fallback | Prompts (no PII by design) | Low | Yes | SOC 2 Type II | 1 | Last-resort fallback; no PII in prompts. |
| Affiliate networks (CJ, etc.) | Commission tracking | Click data (IP truncated) | Medium | Yes | Varies | 2 | IP truncated to /24 before sharing. |

## Review Process

1. **Quarterly review:** Security lead reviews each vendor's compliance status, breach history, and contractual terms.
2. **DPA verification:** Confirm DPA is current and covers all data categories shared.
3. **Incident check:** Review vendor security advisories and breach notifications from the quarter.
4. **Risk re-scoring:** Update risk scores based on any changes in data access, criticality, or compliance posture.
5. **Escalation:** Any vendor scoring 3+ triggers a remediation plan or vendor replacement evaluation.

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-05-03 | Initial register created (A66-F2) | Audit automation |
