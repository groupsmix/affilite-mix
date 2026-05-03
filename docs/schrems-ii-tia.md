# Schrems II Transfer Impact Assessment (TIA)

> **Audit ref:** A71 -- Data residency / SCCs / Schrems II
> **Date:** 2026-04-30
> **Assessor:** Platform compliance team
> **Legal basis:** EDPB Recommendations 01/2020, CJEU C-311/18 (Schrems II), EU-US Data Privacy Framework Adequacy Decision (July 2023)

## 1. Purpose

This document assesses the risks of international data transfers from the EU to third countries for each sub-processor used by the affilite-mix platform, in compliance with GDPR Chapter V (Arts. 44-49).

## 2. Transfer Inventory

| Sub-processor     | Data transferred                                        | Destination                                        | Transfer mechanism                     | DPF certified?                                                                                                   | Risk level |
| ----------------- | ------------------------------------------------------- | -------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------- |
| **Supabase**      | All DB-resident PII (emails, clicks, memberships, etc.) | **EU** (AWS `eu-central-1`, Frankfurt)             | No transfer -- EU-pinned               | N/A (EU)                                                                                                         | **None**   |
| **Cloudflare**    | Edge request metadata, KV keys, R2 objects              | Global edge, EU-pinned via Data Localization Suite | DPA + SCCs                             | Yes                                                                                                              | **Low**    |
| **Stripe**        | Customer email, subscription metadata (no PAN)          | US                                                 | Independent controller, DPA            | Yes ([verified](https://www.dataprivacyframework.gov/s/participant/a2zt000000001gPAAQ)) -- verified 2026-05-03   | **Low**    |
| **Resend**        | Email addresses, email body content                     | US (AWS US-East)                                   | DPA + SCCs                             | ✅ Yes — verified 2026-05-01 ([registry](https://www.dataprivacyframework.gov/s/participant/a2zt0000000GnZOAA0)) | **Low**    |
| **Sentry**        | Error telemetry (PII scrubbed before transmission)      | US                                                 | DPA + SCCs                             | Yes ([verified](https://www.dataprivacyframework.gov))                                                           | **Low**    |
| **Cloudflare AI** | AI prompts (no PII -- verified by prompt sanitisation)  | Global edge                                        | Covered by Cloudflare DPA              | Yes                                                                                                              | **Low**    |
| **Google Gemini** | AI prompts (no PII)                                     | US/Global                                          | Google Cloud DPA                       | Yes                                                                                                              | **Low**    |
| **Groq**          | AI prompts (no PII)                                     | US/Global                                          | DPA executed 2026-05-01; SCCs Module 2 | ⚠️ Not DPF-listed — SCCs supplementary measure in place                                                          | **Low**    |
| **Cohere**        | AI prompts (no PII)                                     | US/Global                                          | DPA executed 2026-05-01; SCCs Module 2 | ⚠️ Not DPF-listed — SCCs supplementary measure in place                                                          | **Low**    |

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

- EU-US Data Privacy Framework certification verified for Stripe (2026-05-03), Sentry, Cloudflare
- Resend: DPF certification verified 2026-05-01 ✅
- Groq: Not DPF-listed; custom DPA + SCCs Module 2 executed 2026-05-01 ✅
- Cohere: Not DPF-listed; custom DPA + SCCs Module 2 executed 2026-05-01 ✅
- All verification action items completed; next review scheduled Q3 2026

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

All US transfers are protected by DPF certification (verified) or custom DPA + SCCs Module 2 (Groq, Cohere), plus technical supplementary measures. The residual risk is assessed as **acceptable** given the nature and volume of data transferred.

## 6. Action Items

- [x] Verify Resend DPF certification — confirmed 2026-05-01
- [x] Verify Groq DPF certification or execute custom DPA — DPA + SCCs Module 2 executed 2026-05-01
- [x] Verify Cohere DPF certification or execute custom DPA — DPA + SCCs Module 2 executed 2026-05-01
- [x] DPF certification status column added to `docs/vendor-dpas.md`
- [x] Schedule next TIA review: Q3 2026 (calendar invite created, due 2026-08-01)

## Last Updated

2026-05-03 (OF-17: all DPF verifications completed; Stripe verified; next review Q3 2026)
