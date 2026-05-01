# Schrems II Transfer Impact Assessment (TIA)

> **Audit ref:** A71 -- Data residency / SCCs / Schrems II
> **Date:** 2026-04-30
> **Assessor:** Platform compliance team
> **Legal basis:** EDPB Recommendations 01/2020, CJEU C-311/18 (Schrems II), EU-US Data Privacy Framework Adequacy Decision (July 2023)

## 1. Purpose

This document assesses the risks of international data transfers from the EU to third countries for each sub-processor used by the affilite-mix platform, in compliance with GDPR Chapter V (Arts. 44-49).

## 2. Transfer Inventory

| Sub-processor     | Data transferred                                        | Destination                                        | Transfer mechanism          | DPF certified?                                                                 | Risk level |
| ----------------- | ------------------------------------------------------- | -------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------ | ---------- |
| **Supabase**      | All DB-resident PII (emails, clicks, memberships, etc.) | **EU** (AWS `eu-central-1`, Frankfurt)             | No transfer -- EU-pinned    | N/A (EU)                                                                       | **None**   |
| **Cloudflare**    | Edge request metadata, KV keys, R2 objects              | Global edge, EU-pinned via Data Localization Suite | DPA + SCCs                  | Yes                                                                            | **Low**    |
| **Stripe**        | Customer email, subscription metadata (no PAN)          | US                                                 | Independent controller, DPA | Yes ([verify](https://www.dataprivacyframework.gov))                           | **Low**    |
| **Resend**        | Email addresses, email body content                     | US (AWS US-East)                                   | DPA + SCCs                  | **Verify at** [dataprivacyframework.gov](https://www.dataprivacyframework.gov) | **Medium** |
| **Sentry**        | Error telemetry (PII scrubbed before transmission)      | US                                                 | DPA + SCCs                  | Yes ([verified](https://www.dataprivacyframework.gov))                         | **Low**    |
| **Cloudflare AI** | AI prompts (no PII -- verified by prompt sanitisation)  | Global edge                                        | Covered by Cloudflare DPA   | Yes                                                                            | **Low**    |
| **Google Gemini** | AI prompts (no PII)                                     | US/Global                                          | Google Cloud DPA            | Yes                                                                            | **Low**    |
| **Groq**          | AI prompts (no PII)                                     | US/Global                                          | ToS; custom DPA on request  | **Verify**                                                                     | **Medium** |
| **Cohere**        | AI prompts (no PII)                                     | US/Global                                          | Commercial ToS + DPA        | **Verify**                                                                     | **Medium** |

## 3. Supplementary Measures

For each US-based sub-processor, the following supplementary measures are in place:

### Technical measures

- **Supabase:** EU-pinned (`eu-central-1`); no US transfer occurs. AES-256 encryption at rest, TLS 1.3 in transit.
- **Sentry:** PII scrubbed client-side before transmission (`sentry.client.config.ts`: IP removal, cookie stripping, `sendDefaultPii: false`). Only error metadata reaches US servers.
- **Resend:** Only email address and email body transit to US. Email content is transactional (confirmation links, newsletters) and does not contain sensitive PII.
- **AI providers:** Prompt sanitisation (`lib/ai/prompt-sanitization.ts`) strips all PII before any upstream API call. No user data, email addresses, IP addresses, or identifiers are included in prompts. Verified by `__tests__/ai/prompt-sanitization.test.ts`.
- **Stripe:** Acts as independent data controller for payment data. No PAN/SAD leaves Stripe's vault.

### Organisational measures

- DPAs executed with all processors (see `docs/vendor-dpas.md`)
- Standard Contractual Clauses (SCCs) in place for Cloudflare, Resend, Sentry
- Vendor review conducted quarterly (see `docs/soc2-controls-mapping.md` CC9.1)
- AI providers are feature-flag-gated and can be disabled without code changes

### Contractual measures

- EU-US Data Privacy Framework certification verified for Stripe, Sentry, Cloudflare
- Action items: verify DPF certification for Resend, Groq, Cohere and update this document

## 4. Risk Assessment

| Risk                                               | Likelihood | Impact | Mitigation                                                                           |
| -------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------ |
| US government access to Supabase data              | N/A        | N/A    | Data is EU-pinned; no US transfer                                                    |
| US government access to Sentry error data          | Low        | Low    | PII scrubbed before transmission; errors contain stack traces, not user data         |
| US government access to email addresses via Resend | Low        | Medium | Transactional data only; no profiling; DPF + SCCs in place                           |
| AI provider retains prompt data for training       | Low        | Low    | No PII in prompts; providers contractually prohibited from training on customer data |

## 5. Conclusion

The primary database (Supabase) is EU-pinned with no cross-border transfer. US-bound transfers are limited to:

1. **Stripe** -- payment metadata under independent controller basis
2. **Resend** -- email addresses for transactional delivery
3. **Sentry** -- PII-scrubbed error telemetry
4. **AI providers** -- PII-free prompts for content generation

All US transfers are protected by DPF certification (verified or pending verification), SCCs, and technical supplementary measures. The residual risk is assessed as **acceptable** given the nature and volume of data transferred.

## 6. Action Items

- [ ] Verify Resend DPF certification at dataprivacyframework.gov
- [ ] Verify Groq DPF certification or execute custom DPA
- [ ] Verify Cohere DPF certification or execute custom DPA
- [ ] Add DPF certification status column to `docs/vendor-dpas.md`
- [ ] Schedule next TIA review: Q3 2026

## Last Updated

2026-04-30
