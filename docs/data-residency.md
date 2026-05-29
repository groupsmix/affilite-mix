# Data Residency

> **R-020**: No data residency enforcement documentation.

## Overview

This document specifies where personal and business data is stored, processed,
and transmitted across the affilite-mix platform infrastructure.

## Data Processing Locations

| Service             | Provider               | Region                     | Data Type                         | GDPR Basis                    | Transfer Mechanism (Ch. V)                          |
| ------------------- | ---------------------- | -------------------------- | --------------------------------- | ----------------------------- | --------------------------------------------------- |
| **Database**        | Supabase               | `eu-central-1` (Frankfurt) | All PII, content, analytics       | Adequacy (EU)                 | N/A (EU-resident)                                   |
| **Edge Compute**    | Cloudflare Workers     | Global (anycast)           | Request processing, rate limiting | Legitimate interest + DLS     | DPA + SCC (Module 2) — see `docs/vendor-dpas.md`    |
| **Object Storage**  | Cloudflare R2          | Auto (nearest region)      | Images, SBOM, logs                | Legitimate interest           | DPA + SCC (Module 2) — see `docs/vendor-dpas.md`    |
| **KV Store**        | Cloudflare KV          | Global (replicated)        | Rate limit counters, cache        | No PII stored                 | N/A (no PII)                                        |
| **Durable Objects** | Cloudflare             | Global (routed)            | Atomic rate limit state           | No PII stored                 | N/A (no PII)                                        |
| **Email**           | Resend                 | US (AWS)                   | Email addresses, content          | Consent (newsletter)          | SCC (Module 2) + TIA — see `docs/schrems-ii-tia.md` |
| **Payments**        | Stripe                 | Global                     | Payment data (PCI scope)          | Contract (payment processing) | EU-US DPF + SCC (Module 2)                          |
| **AI Providers**    | Cloudflare/Google/Groq | Various                    | Content prompts (no PII)          | Legitimate interest           | SCC (Module 2) + TIA — see `docs/schrems-ii-tia.md` |
| **Error Tracking**  | Sentry                 | US (GCP)                   | Stack traces, request metadata    | Legitimate interest           | SCC (Module 2) + TIA — see `docs/schrems-ii-tia.md` |
| **CI/CD**           | GitHub Actions         | US                         | Source code, build artifacts      | Contract                      | EU-US DPF + SCC (Module 2)                          |

## PII Data Flow

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

## Controls

### Database (Supabase)

- **Region**: EU (Frankfurt, `eu-central-1`)
- **Encryption at rest**: AES-256 (AWS RDS default)
- **Encryption in transit**: TLS 1.2+ required
- **Backups**: Daily automated + PITR (7-day retention on Pro)
- **RLS**: Row-Level Security enforces tenant isolation

### Edge (Cloudflare)

- **Data Localization Suite**: Configured to restrict metadata logging to EU
  (see `docs/vendor-dpas.md`)
- **Workers**: Stateless — no PII persisted at the edge
- **KV**: Stores rate-limit counters and cache flags only (no PII)
- **R2**: Images and logs — no PII in filenames or metadata

### Third-Party Processors

All third-party processors have DPAs on file. See `docs/vendor-dpas.md` for
the complete register including:

- Cloudflare DPA
- Supabase DPA (GDPR + HIPAA)
- Stripe DPA (PCI DSS Level 1)
- Resend DPA
- Sentry DPA

## GDPR Compliance

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

## Data Classification

| Classification   | Examples                               | Storage              | Access               |
| ---------------- | -------------------------------------- | -------------------- | -------------------- |
| **Public**       | Published articles, product listings   | Supabase + CDN       | Anyone               |
| **Internal**     | Analytics, admin config, site settings | Supabase (RLS)       | Authenticated admins |
| **Confidential** | Email addresses, user profiles         | Supabase (encrypted) | Admin + data subject |
| **Restricted**   | Payment data, passwords, TOTP secrets  | Stripe / bcrypt hash | System only          |

## Annual Review

This document is reviewed quarterly. Last review: 2026-05-25.

## References

- `docs/vendor-dpas.md` — vendor DPAs and residency commitments
- `docs/ropa.md` — Records of Processing Activities
- `docs/schrems-ii-tia.md` — Schrems II Transfer Impact Assessment
- `docs/egress-policy.md` — data egress controls
- `docs/breach-notification-templates.md` — breach notification procedures
