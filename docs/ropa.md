# Record of Processing Activities (RoPA)

GDPR Article 30 — Record of Processing Activities for affilite-mix.

## Data Categories

| Data Category          | Source                    | Purpose                                     | Legal Basis                        | Recipients                   | Retention                                                                                                            | Cross-border? |
| ---------------------- | ------------------------- | ------------------------------------------- | ---------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------- |
| Newsletter subscribers | User signup form          | Email marketing, product recommendations    | Consent (Art. 6(1)(a))             | Supabase (EU)                | Until unsubscribe + 30 days; **unconfirmed (status=pending) rows hard-deleted after 30 days by `purge_retention()`**; confirmed-then-inactive subscribers auto-purged after 2 years of inactivity | No (EU-pinned) |
| Admin users            | Manual provisioning       | Platform administration, content management | Legitimate interest (Art. 6(1)(f)) | Supabase (EU)                | Account lifetime + 90 days                                                                                           | No (EU-pinned) |
| Affiliate clicks       | Automatic (redirect path) | Revenue attribution, commission tracking    | Legitimate interest (Art. 6(1)(f)) | Supabase (EU), networks      | 365 days (hot) then deleted                                                                                          | No (EU-pinned) |
| Memberships            | User purchase (Stripe)    | Subscription management, access control     | Contract (Art. 6(1)(b))            | Supabase (EU), Stripe (US)   | Subscription lifetime + 7 years                                                                                      | Yes (Stripe US)|
| Comments / UGC         | User submission           | Community engagement                        | Consent (Art. 6(1)(a))             | Supabase (EU)                | Until deletion request; **soft-deleted (status='deleted') rows hard-deleted after 30 days by `purge_retention()`**   | No (EU-pinned) |
| Audit log              | Automatic (admin actions) | Security monitoring, compliance             | Legitimate interest (Art. 6(1)(f)) | Supabase (EU, hot), R2 (archive) | 365 days (hot), 7 years (R2 archive)                                                                            | No (EU-pinned) |
| Stripe events          | Stripe webhooks           | Payment reconciliation                      | Contract (Art. 6(1)(b))            | Supabase (EU)                | 90 days                                                                                                              | No (EU-pinned) |
| Quiz submissions       | User form submission      | Lead generation, personalization            | Consent (Art. 6(1)(a))             | Supabase (EU)                | **365 days** (default), then hard-deleted by `purge_retention()`                                                     | No (EU-pinned) |
| Price alerts           | User signup               | Price monitoring notifications              | Consent (Art. 6(1)(a))             | Supabase (EU)                | Until unsubscribe + 2 years inactivity auto-purge                                                                    | No (EU-pinned) |

## Data Protection Measures

- **Encryption in transit:** TLS 1.3 via Cloudflare edge
- **Encryption at rest:** Supabase managed encryption (AES-256)
- **Access control:** Row Level Security (RLS) with tenant isolation
- **Pseudonymization:** IP addresses truncated to /24 in logs
- **Data minimization:** Only necessary fields collected per purpose
- **Right to erasure:** RTBF endpoint at `/api/admin/privacy/user`

## Sub-processors

| Sub-processor                 | Purpose              | Location                     | DPA in place? |
| ----------------------------- | -------------------- | ---------------------------- | ------------- |
| Supabase                      | Database hosting     | EU (AWS `eu-central-1`, Frankfurt) | Yes     |
| Cloudflare                    | CDN, Workers, R2, KV | Global (Data Localization Suite) | Yes       |
| Stripe                        | Payment processing   | US (independent controller)  | Yes           |
| Resend                        | Email delivery       | US (AWS US-East)             | Yes           |
| Sentry                        | Error monitoring     | US                           | Yes           |
| Affiliate networks (CJ, etc.) | Commission tracking  | US                           | Yes           |
| AI providers (Cloudflare AI, Gemini, Groq, Cohere) | Content generation (no PII sent) | Global | Yes (see `docs/vendor-dpas.md` section 6) |

## Regulatory Scope Statements

### HIPAA (A64)

**Not applicable.** The platform processes no Protected Health Information (PHI). There is no clinical data, no provider portal, and no health-app integrations. The quiz funnel produces preference-style results (e.g. product recommendations), not health information.

### PCI-DSS (A65)

**SAQ A scope only.** The platform never sees or stores a Primary Account Number (PAN). Stripe is the payment processor; all card data is handled exclusively within Stripe's PCI-certified vault. The `memberships` table stores only Stripe-issued tokens (`stripe_customer_id`, `stripe_subscription_id`). Sentry is configured with `sendDefaultPii: false` to prevent accidental capture. See `docs/compliance-readiness.md` for the full SAQ-A checklist.

### Children's Data (A61)

This platform does not offer services directed to children under 16 (GDPR-K, Art. 8) or under 13 (COPPA). We do not knowingly collect personal information from children. If we learn that a child has provided personal data, it will be promptly deleted.

## DPIA Threshold Assessment (Art. 35)

A Data Protection Impact Assessment (DPIA) has been evaluated and **is not required** at this time for the following reasons:

1. **No large-scale special-category data** -- the platform does not process racial/ethnic origin, political opinions, religious beliefs, genetic data, biometric data, health data, sex life, or criminal convictions (Art. 9/10).
2. **No automated individual decision-making** -- AI-generated content produces editorial drafts reviewed by human editors before publication. The quiz funnel produces product recommendations only, with no legal or similarly significant effect on data subjects (Art. 22).
3. **Affiliate behavioural tracking is limited** -- click tracking is limited to attribution (which URL was clicked), gated behind opt-in cookie consent, and does not build user profiles or perform scoring/profiling.
4. **No systematic monitoring of public spaces** -- the platform is a content website, not a surveillance system.
5. **No children's data** -- services are not directed to minors.

This assessment will be revisited if the platform (a) introduces profiling-based ad targeting, (b) begins processing special-category data, (c) deploys AI for automated decisions about individuals, or (d) expands to health/financial services.

## Field-Level PII Classification Matrix

| Table | Column | Classification | Notes |
| ----- | ------ | -------------- | ----- |
| `newsletter_subscribers` | `email` | PII | Primary identifier |
| `newsletter_subscribers` | `site_id` | Internal | Tenant key |
| `newsletter_subscribers` | `status` | Internal | pending/confirmed/unsubscribed |
| `newsletter_subscribers` | `created_at` | Internal | Timestamp |
| `memberships` | `email` | PII | Primary identifier |
| `memberships` | `stripe_customer_id` | PCI-adjacent | Stripe token, not PAN; linkable to payment |
| `memberships` | `stripe_subscription_id` | PCI-adjacent | Stripe token |
| `memberships` | `plan`, `status` | Internal | Subscription metadata |
| `comments` | `user_email` | PII | Author identifier |
| `comments` | `author_name` | PII | Display name |
| `comments` | `body` | UGC | May contain incidental PII |
| `comments` | `ip_address` | PII | Truncated to /24 in logs |
| `quiz_submissions` | `email` | PII | Respondent identifier |
| `quiz_submissions` | `answers` | Preference data | Not sensitive PII |
| `wrist_shots` | `user_email` | PII | Submitter identifier |
| `wrist_shots` | `image_url` | UGC | User-uploaded image |
| `audit_log` | `actor` | PII (hashed) | Admin email or user_id |
| `audit_log` | `target_email_hash` | Pseudonymised PII | SHA-256 of target email |
| `web_vitals` | `pathname`, `metric_name`, `value` | Analytics | No direct PII |
| `affiliate_clicks` | `ip_address` | PII | Truncated to /24 |
| `affiliate_clicks` | `user_agent` | Indirect PII | Browser fingerprint component |
| `admin_users` | `email` | PII | Admin identifier |
| `admin_users` | `password_hash` | Sensitive PII (hashed) | bcrypt cost-12 |
| `admin_users` | `totp_secret_encrypted` | Sensitive PII (encrypted) | AES-256-GCM |
| `price_alerts` | `email` | PII | Subscriber identifier |
| `stripe_events` | `event_id`, `type`, `data` | PCI-adjacent | Stripe metadata, no PAN |

> **Legend:** PII = Personally Identifiable Information, PCI-adjacent = linked to payment but not PAN/SAD, UGC = User-Generated Content, Sensitive PII = requires additional protection.

## DPO Contact

_To be designated by the data controller._

## Automated Retention (purge_retention)

The SECURITY DEFINER function `public.purge_retention()` (migration 00085) runs daily via the `/api/cron/data-retention` Cloudflare Worker
and executes the following deletes inside a single transaction:

| Table                    | Predicate                                                                    | Window |
| ------------------------ | ---------------------------------------------------------------------------- | ------ |
| `affiliate_clicks`       | `created_at < now() - interval`                                              | 365 d  |
| `audit_log`              | `created_at < now() - interval` (after R2 archive)                           | 365 d  |
| `stripe_events`          | `received_at < now() - interval`                                             | 90 d   |
| `newsletter_subscribers` | `status = 'pending' AND created_at < now() - interval`                       | 30 d   |
| `quiz_submissions`       | `created_at < now() - interval`                                              | 365 d  |
| `comments`               | `status = 'deleted' AND COALESCE(updated_at, created_at) < now() - interval` | 30 d   |
| `web_vitals`             | `created_at < now() - interval`                                              | 90 d   |
| `experiment_events`      | `created_at < now() - interval`                                              | 180 d  |
| `ad_impressions`         | `created_at < now() - interval`                                              | 180 d  |

The windows are defined as DECLAREs at the top of `purge_retention()`;
any change MUST be mirrored in this table and reviewed by the DPO.

The corresponding data categories are also covered in the table above:

| Data Category     | Source                        | Purpose                            | Legal Basis                        | Recipients       | Retention                                                    | Cross-border? |
| ----------------- | ----------------------------- | ---------------------------------- | ---------------------------------- | ---------------- | ------------------------------------------------------------ | ------------- |
| Experiment events | Automatic (A/B test SDK)      | Product experimentation, analytics | Legitimate interest (Art. 6(1)(f)) | Supabase (EU) | **180 days** (hot), then hard-deleted by `purge_retention()` | No (EU-pinned) |
| Ad impressions    | Automatic (impression beacon) | Ad delivery analytics, attribution | Legitimate interest (Art. 6(1)(f)) | Supabase (EU) | **180 days** (hot), then hard-deleted by `purge_retention()` | No (EU-pinned) |

## Last Updated

2026-04-30 (audit A61-A100: cross-border reconciliation, PII matrix, DPIA, children's data, HIPAA/PCI scoping)
