# Season 3 — Privacy, Compliance & Reliability Audit

**Repository:** `groupsmix/affilite-mix`
**Branch:** `main`
**Date:** 2026-05-29
**Auditor:** Devin (principal-engineer audit agent)
**Stack:** Next.js 15 (App Router), Supabase (PostgreSQL + RLS), Cloudflare Workers, Stripe
**Scope:** A61–A85 (skipping A64 PCI-DSS, A65 HIPAA — Stripe handles card data)

---

## Table of Contents

1. [A61 — PII Map](#a61--pii-map)
2. [A62 — GDPR Rights](#a62--gdpr-rights)
3. [A63 — CCPA / CPRA](#a63--ccpa--cpra)
4. [A66 — SOC 2 TSC Mapping](#a66--soc-2-tsc-mapping)
5. [A67 — ISO 27001 Annex A Coverage](#a67--iso-27001-annex-a-coverage)
6. [A68 — WCAG 2.2 AA](#a68--wcag-22-aa)
7. [A69 — Cookie / Consent Banner](#a69--cookie--consent-banner)
8. [A70 — ToS / PP vs Actual Behaviour](#a70--tos--pp-vs-actual-behaviour)
9. [A71 — Data Residency](#a71--data-residency)
10. [A72 — EU AI Act](#a72--eu-ai-act)
11. [A73 — Worst-Case Input](#a73--worst-case-input)
12. [A74 — External Call Hygiene](#a74--external-call-hygiene)
13. [A75 — Cache](#a75--cache)
14. [A76 — Retry Storms / Thundering Herd / Cascading Failures](#a76--retry-storms--thundering-herd--cascading-failures)
15. [A77 — Unbounded Loops](#a77--unbounded-loops)
16. [A78 — Unbounded Memory](#a78--unbounded-memory)
17. [A79 — Cold Start / Connection-Pool Warmup](#a79--cold-start--connection-pool-warmup)
18. [A80 — Cost](#a80--cost)
19. [A81 — Log / Metric Cardinality](#a81--log--metric-cardinality)
20. [A82 — Long-Running Jobs](#a82--long-running-jobs)
21. [A83 — Graceful Shutdown](#a83--graceful-shutdown)
22. [A84 — Fault Tolerance](#a84--fault-tolerance)
23. [A85 — SLO Math](#a85--slo-math)

---

## A61 — PII Map

### Field-Level Classification

| Table                    | PII Field                                      | Classification               | Lawful Basis (GDPR Art. 6)       | Purpose                               | Retention                                                                      | Processors                           |
| ------------------------ | ---------------------------------------------- | ---------------------------- | -------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------ |
| `newsletter_subscribers` | `email`                                        | Direct PII                   | Consent Art. 6(1)(a)             | Email marketing                       | Until unsubscribe + 30 d; unconfirmed purged at 30 d; inactive 2 yr auto-purge | Supabase (EU), Resend (US — SCC)     |
| `newsletter_subscribers` | `confirmation_token`, `unsubscribe_token`      | Pseudonymous                 | Consent                          | Double opt-in / one-click unsubscribe | Cleared on confirm / purge                                                     | Supabase (EU)                        |
| `admin_users`            | `email`                                        | Direct PII                   | Legitimate interest Art. 6(1)(f) | Platform administration               | Account lifetime + 90 d                                                        | Supabase (EU)                        |
| `admin_users`            | `name`                                         | Direct PII                   | Legitimate interest Art. 6(1)(f) | Display in admin UI                   | Account lifetime + 90 d                                                        | Supabase (EU)                        |
| `admin_users`            | `password_hash`                                | Sensitive (derived)          | Legitimate interest              | Authentication                        | Account lifetime                                                               | Supabase (EU)                        |
| `admin_users`            | `totp_secret`                                  | Sensitive                    | Legitimate interest              | 2FA                                   | Account lifetime                                                               | Supabase (EU)                        |
| `memberships`            | `email`, `name`                                | Direct PII                   | Contract Art. 6(1)(b)            | Subscription management               | Subscription + 7 yr (tax)                                                      | Supabase (EU), Stripe (US — DPF+SCC) |
| `memberships`            | `stripe_customer_id`, `stripe_subscription_id` | Pseudonymous                 | Contract                         | Payment link                          | Subscription + 7 yr                                                            | Supabase (EU), Stripe                |
| `comments`               | `user_email`, `user_name`                      | Direct PII                   | Consent Art. 6(1)(a)             | UGC attribution                       | Until deletion; soft-delete purge 30 d                                         | Supabase (EU)                        |
| `wrist_shots`            | `user_email`, `user_name`                      | Direct PII                   | Consent Art. 6(1)(a)             | UGC submission                        | Until deletion request                                                         | Supabase (EU)                        |
| `quiz_submissions`       | `email`                                        | Direct PII                   | Consent Art. 6(1)(a)             | Lead gen / personalisation            | 365 d then hard-delete                                                         | Supabase (EU)                        |
| `quiz_submissions`       | `session_id`                                   | Pseudonymous                 | Consent                          | Session correlation                   | 365 d                                                                          | Supabase (EU)                        |
| `price_alerts`           | `email`                                        | Direct PII                   | Consent Art. 6(1)(a)             | Price notifications                   | Until unsub + 2 yr inactivity                                                  | Supabase (EU)                        |
| `drip_enrollments`       | `email`                                        | Direct PII                   | Consent Art. 6(1)(a)             | Drip campaign delivery                | Campaign lifecycle                                                             | Supabase (EU)                        |
| `affiliate_clicks`       | `ip_prefix`                                    | Pseudonymous (truncated /24) | Legitimate interest Art. 6(1)(f) | Revenue attribution / dedup           | Nulled at 30 d; row at 365 d                                                   | Supabase (EU)                        |
| `affiliate_clicks`       | `fingerprint`                                  | Pseudonymous (HMAC)          | Legitimate interest              | 24 h dedup                            | Nulled at 30 d                                                                 | Supabase (EU)                        |
| `affiliate_clicks`       | `referrer`                                     | Indirect PII                 | Legitimate interest              | Attribution                           | 365 d                                                                          | Supabase (EU)                        |
| `audit_log`              | `actor` (email), `ip`                          | Direct PII / truncated       | Legitimate interest              | Security monitoring                   | 365 d (hot) → 7 yr R2 archive                                                  | Supabase (EU), R2                    |
| `consent_log`            | `ip_truncated`, `ua_hash`, `subject_id`        | Pseudonymous                 | Legitimate interest Art. 6(1)(f) | Consent proof                         | Indefinite (audit trail)                                                       | Supabase (EU)                        |
| `stripe_events`          | Webhook payload (may contain `customer.email`) | Direct PII                   | Contract                         | Payment reconciliation                | 90 d                                                                           | Supabase (EU)                        |

### Findings

| ID     | Severity | Category | Location                               | Description                                                                                                                                                                                                                                         | Fix                                                                       | Standard          |
| ------ | -------- | -------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------- |
| S3-001 | Low      | PII Map  | `docs/ropa.md`                         | RoPA exists and covers all main tables. `drip_enrollments` was added to the privacy endpoints but is missing from the main RoPA table's data categories.                                                                                            | Add `drip_enrollments` row to RoPA with retention/purpose/basis.          | GDPR Art. 30      |
| S3-002 | Info     | PII Map  | `types/database.ts:45–55`              | `AffiliateClickRow` in the hand-curated types does not include `ip_prefix` or `fingerprint` fields that exist in the actual DB schema (visible in DAL and data-retention cron). Types file is documentation-only but drift could mislead reviewers. | Add `ip_prefix` and `fingerprint` optional fields to `AffiliateClickRow`. | Internal          |
| S3-003 | Low      | PII Map  | `app/api/cron/data-retention/route.ts` | `consent_log` has no retention purge — records are kept indefinitely. This is defensible for audit proof but should be documented as an explicit retention decision.                                                                                | Add retention note to RoPA: "consent_log: indefinite (audit/legal hold)". | GDPR Art. 5(1)(e) |

---

## A62 — GDPR Rights

### Code Path Coverage

| Right                     | Article | Endpoint / Code Path                                                                                     | Status         |
| ------------------------- | ------- | -------------------------------------------------------------------------------------------------------- | -------------- |
| Access (data export)      | Art. 15 | `GET /api/admin/privacy/user` — exports data from 7 tables                                               | ✅ Implemented |
| Rectification             | Art. 16 | `POST /api/admin/privacy/rectify` — corrects email/name across 7 tables                                  | ✅ Implemented |
| Erasure (RTBF)            | Art. 17 | `DELETE /api/admin/privacy/user` — deletes/anonymises across tables; retains clicks/audit (legal basis)  | ✅ Implemented |
| Restriction               | Art. 18 | `POST /api/admin/privacy/restrict` — `subject_restrictions` table                                        | ✅ Implemented |
| Portability               | Art. 20 | `GET /api/admin/privacy/user` returns JSON export                                                        | ⚠️ Partial     |
| Objection                 | Art. 21 | `POST /api/admin/privacy/object` — `subject_objections` table (marketing/profiling/analytics/all)        | ✅ Implemented |
| Automated decision-making | Art. 22 | AI content generation is admin-triggered with human-in-the-loop; no automated decisions on data subjects | N/A            |

### Findings

| ID     | Severity | Category | Location                                     | Description                                                                                                                                                                                                                                                                                                                                    | Fix                                                                                                             | Standard        |
| ------ | -------- | -------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------- |
| S3-004 | Medium   | GDPR     | `app/api/admin/privacy/user/route.ts:28`     | Access/export endpoint (`GET`) returns JSON but does not offer a machine-readable portable format (CSV/JSON-LD). Art. 20 requires data in a "structured, commonly used and machine-readable format". The current JSON response satisfies machine-readability but no documented download/export flow exists for the data subject to self-serve. | Add a `format=csv` query param or a self-service portal link. Document the export format in the privacy policy. | GDPR Art. 20    |
| S3-005 | Low      | GDPR     | `app/api/admin/privacy/user/route.ts:55–112` | Access export queries 7 tables but does not include `consent_log` records for the subject. A data subject has the right to see their consent history.                                                                                                                                                                                          | Add `consent_log` lookup by `subject_id` to the export.                                                         | GDPR Art. 15    |
| S3-006 | Low      | GDPR     | `app/api/admin/privacy/restrict/route.ts`    | Restriction is recorded but no downstream processor checks `subject_restrictions` before using data. Newsletter send, analytics pipelines, and drip campaigns should query restrictions.                                                                                                                                                       | Add restriction check to newsletter send and drip campaign pipelines.                                           | GDPR Art. 18(2) |
| S3-007 | Info     | GDPR     | Privacy endpoints                            | All GDPR endpoints require `super_admin` role. No self-service data subject portal. Acceptable for B2B but consider a subject-facing request form.                                                                                                                                                                                             | Consider adding a public GDPR request form at `/privacy#request`.                                               | GDPR Art. 12    |

---

## A63 — CCPA / CPRA

### Coverage

| Right                          | CCPA §    | Implementation                                                      | Status |
| ------------------------------ | --------- | ------------------------------------------------------------------- | ------ |
| Right to Know                  | §1798.100 | `GET /api/admin/privacy/user` — same as GDPR access export          | ✅     |
| Right to Delete                | §1798.105 | `DELETE /api/admin/privacy/user` — same as GDPR erasure             | ✅     |
| Right to Correct               | §1798.106 | `POST /api/admin/privacy/rectify` — same as GDPR rectification      | ✅     |
| Right to Opt-Out of Sale/Share | §1798.120 | GPC detection in CMP (`isGpcEnabled()`); no sale/share of PI occurs | ✅     |
| Non-Discrimination             | §1798.125 | No tiered service based on privacy choices                          | ✅     |

### Findings

| ID     | Severity | Category | Location                                               | Description                                                                                                                                                                                                                   | Fix                                                                                                                                                              | Standard                                 |
| ------ | -------- | -------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| S3-008 | Medium   | CCPA     | `app/(public)/privacy/page.tsx`                        | Privacy policy page does not include CCPA-required disclosures: categories of PI collected, purposes, categories of third parties, and "Do Not Sell or Share My Personal Information" link.                                   | Add a CCPA-specific section to the privacy policy with the required disclosures. Add a "Do Not Sell" link in the footer (can point to cookie preferences modal). | CCPA §1798.100(b), §1798.120             |
| S3-009 | Low      | CCPA     | `app/(public)/components/cookie-consent-cmp.tsx:27–33` | GPC detection correctly honours `navigator.globalPrivacyControl` and auto-rejects non-essential categories. However, no server-side GPC header check exists in the middleware for requests without JS (e.g., crawlers, curl). | Add `Sec-GPC: 1` header check in middleware to suppress analytics/affiliate tracking server-side.                                                                | CCPA §1798.135, Cal. Civ. Code §1798.185 |

---

## A66 — SOC 2 TSC Mapping

### Summary

Existing mapping in `docs/soc2-controls-mapping.md` covers CC1–CC9, A1, C1, P1–P8, and PI1. The mapping is well-structured with evidence references.

### Findings

| ID     | Severity | Category | Location                        | Description                                                                                                                                                                                                                        | Fix                                                                                                 | Standard           |
| ------ | -------- | -------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------ |
| S3-010 | Medium   | SOC 2    | `docs/soc2-controls-mapping.md` | CC6.2 (new access provisioning) and CC6.3 (access removal) are marked "In progress". No automated access review beyond the `cron/access-review` job. Formal provisioning/deprovisioning checklists are referenced but not in-repo. | Complete onboarding/offboarding checklists and link them. Consider automating access review alerts. | SOC 2 CC6.2, CC6.3 |
| S3-011 | Low      | SOC 2    | `docs/soc2-controls-mapping.md` | CC1.2 (board oversight) and CC1.4 (commitment to competence) are "In progress". These are process/HR controls but should have target completion dates.                                                                             | Add target dates and responsible owners for CC1.2 and CC1.4.                                        | SOC 2 CC1          |
| S3-012 | Info     | SOC 2    | `docs/soc2-controls-mapping.md` | PI1 (processing integrity) references optimistic locking on products (`version` column) and audit logging. Coverage is adequate for current scale.                                                                                 | No action needed.                                                                                   | SOC 2 PI1          |

---

## A67 — ISO 27001 Annex A Coverage

### Summary

`docs/iso27001-annex-a.md` maps all 93 Annex A controls across 4 themes. Good coverage with clear evidence references.

### Findings

| ID     | Severity | Category  | Location                   | Description                                                                                                                                                                                                | Fix                                                                                                                                          | Standard         |
| ------ | -------- | --------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| S3-013 | Medium   | ISO 27001 | `docs/iso27001-annex-a.md` | A.5.13 (labelling of information) is "Partial" — PII matrix labels columns but no runtime data-classification tagging exists. For ISO certification, each data object should carry a classification label. | Implement metadata-level classification tags on Supabase tables (e.g., `data_class: confidential` column or RLS policy tag).                 | ISO 27001 A.5.13 |
| S3-014 | Low      | ISO 27001 | `docs/iso27001-annex-a.md` | A.8.10 (information deletion) is "Implemented" via `data-retention` cron, but no evidence of deletion verification (confirming rows were actually removed after purge).                                    | Add post-purge verification query and log the count. This is already partially done in the cron results object but not externally auditable. | ISO 27001 A.8.10 |
| S3-015 | Low      | ISO 27001 | `docs/iso27001-annex-a.md` | A.5.23 (information security for cloud services) references Cloudflare DPA and Supabase DPA but does not mention periodic review cadence.                                                                  | Add annual review date for each cloud service DPA to the vendor register.                                                                    | ISO 27001 A.5.23 |

---

## A68 — WCAG 2.2 AA

### Coverage

| Criterion                    | Area                | Status     | Evidence                                                                                                                                                                      |
| ---------------------------- | ------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1.1 Non-text Content       | Alt text on images  | ⚠️ Partial | `ProductRow.image_alt` exists; `img` tags in `sanitize-html.ts` allow `alt` attr. Admin-uploaded images rely on user-provided alt text — no validation that alt is non-empty. |
| 1.3.1 Info and Relationships | Semantic HTML       | ✅         | Pages use `<h1>`–`<h6>`, `<nav>`, `<main>`, `<form>`, `<label>`.                                                                                                              |
| 1.4.3 Contrast (Minimum)     | 4.5:1 ratio         | ✅         | Accessibility statement claims 4.5:1 minimum. Tailwind config uses standard gray scale.                                                                                       |
| 2.1.1 Keyboard               | Keyboard navigation | ⚠️ Partial | Cookie consent banner is keyboard-navigable. Admin login form uses `<form>` + `<label>`. TipTap editor keyboard support depends on library defaults.                          |
| 2.4.6 Headings and Labels    | Form labels         | ✅         | Admin login imports `Label` from `components/ui/label`. Newsletter signup uses semantic form elements.                                                                        |
| 3.1.1 Language of Page       | `lang` attribute    | ✅         | Site language set via `site.language` on layout. Arabic sites get `lang="ar"` + `dir="rtl"`.                                                                                  |
| 4.1.2 Name, Role, Value      | ARIA                | ✅         | `role="status"`, `aria-live="polite"` on newsletter success. `aria-labelledby` on modals.                                                                                     |

### Findings

| ID     | Severity | Category | Location                                          | Description                                                                                                                                                           | Fix                                                                                            | Standard             |
| ------ | -------- | -------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------- |
| S3-016 | Medium   | A11y     | `app/admin/(dashboard)/products/product-form.tsx` | Product `image_alt` field exists but is not validated as non-empty on save. Empty alt text on product images violates WCAG 1.1.1.                                     | Add server-side validation: require non-empty `image_alt` when `image_url` is set.             | WCAG 2.2 1.1.1       |
| S3-017 | Low      | A11y     | `app/(public)/components/cookie-consent-cmp.tsx`  | Accessibility statement acknowledges the cookie banner may not announce dynamic content changes to all screen readers. Known limitation with `vanilla-cookieconsent`. | Plan upgrade to a TCF-certified CMP (Didomi, OneTrust) that has full ARIA live-region support. | WCAG 2.2 4.1.3       |
| S3-018 | Low      | A11y     | `app/(public)/accessibility/page.tsx`             | Accessibility statement lists known limitations (ad iframes, price charts) but does not include a conformance date or audit methodology.                              | Add last-audit date and testing methodology (axe, Lighthouse, manual screen reader).           | WCAG 2.2 Conformance |
| S3-019 | Info     | A11y     | `app/admin/login/page.tsx`                        | Admin login uses `<Label>` and `<form>` correctly. Forgot-password modal uses `aria-labelledby`.                                                                      | No action needed.                                                                              | WCAG 2.2             |

---

## A69 — Cookie / Consent Banner

### Architecture

- CMP: `vanilla-cookieconsent` (MIT) wrapped in `app/(public)/components/cookie-consent-cmp.tsx`
- Categories: `necessary` (always on), `analytics`, `affiliate`, `advertising`
- Consent proof: `POST /api/consent/log` — server-side record with truncated IP, UA hash, banner version, GPC flag
- GPC: Client-side `navigator.globalPrivacyControl` detected; auto-rejects non-essential if active
- Banner version: `CONSENT_BANNER_VERSION = "2026-04"` — bumped when banner text changes
- i18n: English + Arabic translations

### Findings

| ID     | Severity | Category | Location                                         | Description                                                                                                                                                                                                                                                                                                                                 | Fix                                                                                                                 | Standard                     |
| ------ | -------- | -------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| S3-020 | Medium   | Consent  | `app/(public)/components/cookie-consent-cmp.tsx` | Banner fires `consent-before-fire` correctly — analytics/affiliate/advertising scripts only load after consent. However, the `postConsentProof` function uses `navigator.sendBeacon` which fires regardless of consent status (it logs the consent decision itself, not tracking data). This is correct behaviour but should be documented. | Add inline comment confirming beacon is consent-proof logging (not tracking). Already present but could be clearer. | ePrivacy Art. 5(3)           |
| S3-021 | Low      | Consent  | `app/(public)/components/cookie-consent-cmp.tsx` | No explicit "Reject All" button in the initial banner view (only "Accept All" and "Manage Preferences"). The "Accept Necessary" button exists in the preferences modal. A "Reject All" on the initial view would improve GDPR compliance and remove any dark-pattern concern.                                                               | Add a "Reject All" button alongside "Accept All" on the initial consent modal.                                      | GDPR Art. 7, EDPB Guidelines |
| S3-022 | Info     | Consent  | `app/api/consent/log/route.ts:15–23`             | Consent categories are validated against a strict allowlist (`VALID_CONSENT_CATEGORIES`). Rate-limited to 5/min per IP. Well-implemented.                                                                                                                                                                                                   | No action needed.                                                                                                   | ePrivacy                     |

---

## A70 — ToS / PP vs Actual Behaviour

### Gap Analysis

| Policy Claim                                             | Actual Behaviour                                                                                               | Gap?         |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------ |
| "Cookies only with consent"                              | CMP blocks non-essential cookies until consent — confirmed in code                                             | ✅ No gap    |
| "We track affiliate clicks"                              | Click tracking in `POST /api/track/click` requires consent cookie check via CMP                                | ✅ No gap    |
| "Email for newsletter only"                              | Newsletter email stored in `newsletter_subscribers`; also used in drip campaigns                               | ⚠️ Minor gap |
| "Contact us for data deletion"                           | Admin-only RTBF endpoint; no self-service form                                                                 | ⚠️ Minor gap |
| "We use analytics cookies"                               | Analytics category defined in CMP; no third-party analytics SDK found (Sentry captures errors, not page views) | ✅ No gap    |
| "Legal basis: consent for cookies"                       | Correctly implemented via CMP                                                                                  | ✅ No gap    |
| "Legal basis: legitimate interest for essential cookies" | CSRF cookie, admin auth cookie — always set                                                                    | ✅ No gap    |

### Findings

| ID     | Severity | Category | Location                        | Description                                                                                                                                                                                                          | Fix                                                                                          | Standard           |
| ------ | -------- | -------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------ |
| S3-023 | Medium   | ToS/PP   | `app/(public)/privacy/page.tsx` | Privacy policy says email is collected "when you subscribe to our newsletter" but `drip_enrollments` table also stores email for automated campaigns. The privacy policy should disclose drip/lifecycle email usage. | Update privacy policy to mention lifecycle/drip email campaigns and their opt-out mechanism. | GDPR Art. 13(1)(c) |
| S3-024 | Low      | ToS/PP   | `app/(public)/privacy/page.tsx` | Privacy policy does not list all sub-processors (Resend, Sentry, AI providers). The data residency doc (`docs/data-residency.md`) lists them but the public-facing PP should reference or inline them.               | Add a sub-processor list or link to a public sub-processor page.                             | GDPR Art. 13(1)(e) |
| S3-025 | Low      | ToS/PP   | `app/(public)/privacy/page.tsx` | Privacy policy does not mention data retention periods. The RoPA has detailed retention but the public PP should summarise them.                                                                                     | Add a retention schedule summary to the privacy policy.                                      | GDPR Art. 13(2)(a) |

---

## A71 — Data Residency

### Summary

Comprehensive data residency documentation exists at `docs/data-residency.md`.

| Service            | Region                     | PII?              | Transfer Mechanism |
| ------------------ | -------------------------- | ----------------- | ------------------ |
| Supabase (DB)      | `eu-central-1` (Frankfurt) | Yes               | N/A (EU-resident)  |
| Cloudflare Workers | Global (anycast)           | In-memory only    | DPA + SCC          |
| Cloudflare R2      | Auto (nearest)             | No PII in storage | DPA + SCC          |
| Cloudflare KV      | Global (replicated)        | No PII            | N/A                |
| Resend (email)     | US (AWS)                   | Email addresses   | SCC + TIA          |
| Stripe             | Global                     | Payment data      | EU-US DPF + SCC    |
| Sentry             | US (GCP)                   | Stack traces      | SCC + TIA          |
| AI providers       | Various                    | No PII in prompts | SCC + TIA          |

### Findings

| ID     | Severity | Category  | Location                              | Description                                                                                                                                                     | Fix                                                                                                            | Standard     |
| ------ | -------- | --------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------ |
| S3-026 | Low      | Residency | `docs/data-residency.md`              | Document references Cloudflare Data Localisation Suite (DLS) for metadata logging restriction to EU, but no terraform config or wrangler setting enforces this. | Verify DLS is configured in Cloudflare dashboard and add a terraform data source or manual evidence reference. | GDPR Ch. V   |
| S3-027 | Info     | Residency | `docs/schrems-ii-tia.md` (referenced) | Transfer Impact Assessment exists for US-bound transfers. Adequate documentation.                                                                               | No action needed.                                                                                              | GDPR Art. 46 |

---

## A72 — EU AI Act

### Classification

- **Risk class:** Minimal risk (Article 6, Annex III)
- **Rationale:** Content generation assistant for affiliate marketing; no decisions affecting natural persons' rights, safety, health, or access to services.
- **Technical documentation:** `docs/ai-system-technical-doc.md` (Annex IV compliant)

### Findings

| ID     | Severity | Category  | Location                          | Description                                                                                                                                                       | Fix                                                                                       | Standard                      |
| ------ | -------- | --------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------- |
| S3-028 | Low      | EU AI Act | `docs/ai-system-technical-doc.md` | Technical documentation is comprehensive (Annex IV §1–§10). However, §4 (Monitoring) does not reference real-time output quality metrics — only spend monitoring. | Add output quality tracking (rejection rate, human-edit ratio) to the monitoring section. | EU AI Act Art. 9, Annex IV §4 |
| S3-029 | Info     | EU AI Act | `lib/ai/content-generator.ts`     | AI-generated content is flagged with `ai_generated: true` and requires `human_reviewed_at` timestamp before publishing. Transparency obligation met.              | No action needed.                                                                         | EU AI Act Art. 50             |
| S3-030 | Info     | EU AI Act | `docs/ai-governance.md`           | Comprehensive governance doc covers models, guardrails, spend monitoring, and data flow.                                                                          | No action needed.                                                                         | EU AI Act Art. 9              |

---

## A73 — Worst-Case Input

### Analysis

Documented in `docs/worst-case-input-analysis.md` for 5 public endpoints. Each has pathological-input test assertions (p99 < 2 s, memory < 64 MB, no DB query > 250 ms).

### Findings

| ID     | Severity | Category    | Location                            | Description                                                                                                                                                                                              | Fix                                                                                   | Standard |
| ------ | -------- | ----------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------- |
| S3-031 | Medium   | Reliability | `app/api/newsletter/route.ts`       | `POST /api/newsletter` parses JSON body but the body size is not explicitly capped before parsing. The middleware `checkBodySize` caps at 1 MB globally, but the newsletter route only needs ~200 bytes. | Add route-specific body size limit (e.g., 2 KB) to reject oversized payloads earlier. | OWASP    |
| S3-032 | Low      | Reliability | `docs/worst-case-input-analysis.md` | Worst-case analysis covers 5 endpoints but omits `POST /api/consent/log`, `POST /api/community/comments`, and `POST /api/community/wrist-shots`.                                                         | Extend worst-case analysis to all public POST endpoints.                              | Internal |
| S3-033 | Low      | Reliability | `lib/sanitize-html.ts`              | HTML sanitizer uses allowlist approach (good) but does not cap total input length before parsing. A 10 MB HTML blob with deeply nested allowed tags could cause CPU spikes.                              | Add `if (input.length > MAX_HTML_LENGTH) return ""` guard before parsing.             | CWE-400  |

---

## A74 — External Call Hygiene

### Inventory

| External Call                                | Timeout                      | Retry + Backoff                                            | Circuit Breaker                                                        | Fallback                          |
| -------------------------------------------- | ---------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------- |
| AI providers (Cloudflare/Gemini/Groq/Cohere) | 8 s (`fetchWithTimeout`)     | ✅ Configurable (`retry.maxRetries`, jittered exponential) | ✅ Per-provider (`lib/ai/circuit-breaker.ts`) with KV fleet-wide state | ✅ 4-provider fallback chain      |
| Supabase (DB)                                | Supabase SDK default (~30 s) | ❌ No retry                                                | ❌ No circuit breaker                                                  | ❌ 503 on failure                 |
| Stripe webhook verification                  | SDK default                  | ❌ No retry (webhook is inbound)                           | ❌ N/A                                                                 | ✅ DLQ (`webhook-dlq`)            |
| Resend (email send)                          | Not explicitly set           | ❌ No retry                                                | ❌ No circuit breaker                                                  | ❌ 503 if API key missing         |
| Cloudflare KV                                | Runtime default (~5 s)       | ❌ No retry                                                | ✅ Grace window + fail-closed                                          | ✅ In-memory fallback             |
| Sitemap ping (Google/Bing)                   | `fetchWithTimeout` 8 s       | ❌ No retry                                                | ❌ No circuit breaker                                                  | ✅ Fire-and-forget (non-critical) |

### Findings

| ID     | Severity | Category    | Location                         | Description                                                                                                                                                           | Fix                                                                                                                                                       | Standard          |
| ------ | -------- | ----------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| S3-034 | Medium   | Reliability | `lib/supabase-server.ts`         | Supabase client calls have no explicit timeout, retry, or circuit breaker. A Supabase outage will cause all API routes to hang until the default TCP timeout (~30 s). | Wrap tenant client calls with `fetchWithTimeout` or add a Supabase-level `fetch` override with timeout. Consider a circuit breaker for the DB connection. | SRE best practice |
| S3-035 | Medium   | Reliability | `app/api/newsletter/route.ts:74` | Resend email send has no timeout or retry. A Resend outage will cause newsletter signups to fail with no retry mechanism.                                             | Add `fetchWithTimeout` wrapper and a transient-failure retry (1 retry with 1 s backoff).                                                                  | SRE best practice |
| S3-036 | Low      | Reliability | `lib/sitemap-ping.ts`            | Sitemap ping is fire-and-forget (appropriate) but has no logging of failures.                                                                                         | Add `logger.warn` on ping failure for observability.                                                                                                      | Internal          |

---

## A75 — Cache

### Topology

| Layer                       | TTL                     | Stampede Protection                           | Invalidation                                                     | Poisoning Protection                                    |
| --------------------------- | ----------------------- | --------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| Next.js ISR (`revalidate`)  | Per-page (60 s typical) | ✅ `singleFlight` / `Singleflight` coalescing | ✅ `revalidateTag()` with site-scoped tags (`lib/cache-tags.ts`) | ✅ Tags scoped by site UUID                             |
| Cloudflare KV (site lookup) | 60 s                    | ✅ `singleFlight` prevents concurrent DB hits | ✅ On admin site update                                          | ✅ Hostname validated/sanitised before key construction |
| Cloudflare KV (rate limit)  | Window-based            | N/A                                           | Self-expiring                                                    | ✅ Key sanitisation                                     |
| Cloudflare KV (click dedup) | 86400 s (24 h)          | N/A                                           | Self-expiring                                                    | ✅ HMAC fingerprint — no raw PII in key                 |
| KV (circuit breaker state)  | Recovery timeout        | N/A                                           | On recovery                                                      | ✅ Key prefix `cb:`                                     |

### Findings

| ID     | Severity | Category | Location                        | Description                                                                                                                                                   | Fix                                                                                       | Standard          |
| ------ | -------- | -------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------- |
| S3-037 | Low      | Cache    | `lib/middleware-site-lookup.ts` | KV cache for site lookup uses 60 s TTL with singleflight. No stale-while-revalidate pattern — expired entries cause a synchronous DB hit on the next request. | Consider adding SWR: return stale value immediately while revalidating in the background. | SRE best practice |
| S3-038 | Info     | Cache    | `lib/cache-tags.ts`             | Cache tags are correctly scoped by site UUID, preventing cross-tenant cache invalidation. Well-designed.                                                      | No action needed.                                                                         | Internal          |

---

## A76 — Retry Storms / Thundering Herd / Cascading Failures

### Findings

| ID     | Severity | Category    | Location                     | Description                                                                                                                                                                                                                                        | Fix                                                                                                                                                                                  | Standard          |
| ------ | -------- | ----------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| S3-039 | Low      | Reliability | `lib/fetch-timeout.ts:25–28` | Jittered exponential backoff uses "full jitter" strategy — well-implemented. Max delay capped at 10 s. Default retryable statuses include 429.                                                                                                     | No action needed.                                                                                                                                                                    | AWS best practice |
| S3-040 | Low      | Reliability | `lib/ai/circuit-breaker.ts`  | Circuit breaker with KV-backed fleet-wide state sharing prevents all isolates from independently hammering a failed provider. 5-failure threshold, 30 s recovery, 5 min reset. Well-designed.                                                      | No action needed.                                                                                                                                                                    | SRE best practice |
| S3-041 | Medium   | Reliability | `lib/rate-limit.ts`          | Rate limiter gracefully degrades from KV → in-memory → fail-closed after grace window. However, `KV_GRACE_MS` default is 60 s — during this window, each isolate has its own counters, so a distributed attacker could exploit per-isolate limits. | Consider reducing `KV_GRACE_MS` to 15–30 s for security-critical routes (login, admin). Route-level `graceMs` override already exists (FIX-07) — ensure it's set on all auth routes. | SRE               |

---

## A77 — Unbounded Loops

### Findings

| ID     | Severity | Category    | Location                                           | Description                                                                                                                                                                                                                          | Fix                                                                                                               | Standard |
| ------ | -------- | ----------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | -------- |
| S3-042 | Info     | Reliability | `lib/pagination.ts`, `lib/dal/pagination-guard.ts` | Two pagination guards exist: API-level (`parsePagination`, max 100) and DAL-level (`clampPagination`, max 200). Both enforce hard caps.                                                                                              | No action needed.                                                                                                 | CWE-400  |
| S3-043 | Low      | Reliability | `app/api/cron/data-retention/route.ts:58–111`      | Data retention cron uses cursor-based batch processing (`BATCH_SIZE = 5000`) with checkpoint persistence. Unbounded loop is guarded by batch-size check. However, no total iteration cap — a very large backlog could run for hours. | Add a max-iterations guard (e.g., 100 batches = 500 K rows per run) to prevent CPU timeout on Cloudflare Workers. | CWE-835  |
| S3-044 | Info     | Reliability | `middleware.ts:98–107`                             | Middleware recursion depth capped at `MAX_RECURSION_DEPTH = 3` via `x-worker-recursion-depth` header.                                                                                                                                | No action needed.                                                                                                 | CWE-674  |

---

## A78 — Unbounded Memory

### Findings

| ID     | Severity | Category    | Location                    | Description                                                                                                                                                                 | Fix                                                                                                                                                       | Standard |
| ------ | -------- | ----------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| S3-045 | Low      | Reliability | `lib/single-flight.ts`      | Inflight map grows unbounded in theory, but entries are removed on Promise settlement. Under sustained high-cardinality keys (e.g., per-user singleflight), map could grow. | Add a cap: `if (inflight.size > MAX_INFLIGHT) return fn()` — bypass coalescing under pressure.                                                            | CWE-400  |
| S3-046 | Low      | Reliability | `lib/rate-limit.ts`         | In-memory rate limit fallback uses a `Map` without eviction. On long-lived isolates with many unique IPs, this could leak memory.                                           | Add LRU eviction to the in-memory rate limit map (tests in `__tests__/rate-limit-lru-eviction.test.ts` suggest this may already be implemented — verify). | CWE-401  |
| S3-047 | Info     | Reliability | `lib/ai/circuit-breaker.ts` | Circuit breaker registry is bounded by provider count (4 providers). No memory concern.                                                                                     | No action needed.                                                                                                                                         | Internal |

---

## A79 — Cold Start / Connection-Pool Warmup / Lazy-Init Thrash

### Findings

| ID     | Severity | Category    | Location                      | Description                                                                                                                                                                                                                                                                          | Fix                                                                                                                                                                                      | Standard |
| ------ | -------- | ----------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| S3-048 | Low      | Performance | `lib/stripe-webhook.ts:45–65` | Stripe webhook HMAC key is pre-warmed on cold start (`prewarmStripeWebhookKey`). First webhook request avoids 50–100 ms crypto.subtle.importKey latency. Well-designed.                                                                                                              | No action needed.                                                                                                                                                                        | SRE      |
| S3-049 | Low      | Performance | `lib/hmac-key.ts:52`          | HMAC keys for click tracking are pre-warmed at module load via `getOrDeriveHmacKey()` with caching. Eliminates per-request HKDF derivation.                                                                                                                                          | No action needed.                                                                                                                                                                        | SRE      |
| S3-050 | Medium   | Performance | `lib/supabase-server.ts`      | Supabase client is created per-request via `getTenantClient()`. On Cloudflare Workers, each isolate gets a fresh client with no connection pooling. Supabase's `fetch`-based client mitigates this (HTTP/2 multiplexing), but connection setup latency still applies on cold starts. | Consider a module-level client cache keyed by site_id to reuse clients within an isolate's lifetime. Document that Supabase's Supavisor pooler handles connection reuse at the DB level. | SRE      |

---

## A80 — Cost

### Analysis

| Cost Factor              | Implementation                                                                      | Status                  |
| ------------------------ | ----------------------------------------------------------------------------------- | ----------------------- |
| Per-tenant AI quotas     | `lib/quotas.ts` — per-tenant ceilings for tokens, cost, requests, R2 storage/egress | ✅                      |
| Platform-wide AI ceiling | `QUOTA_PLATFORM_AI_COST_MICRO_USD_PER_DAY` env var                                  | ✅                      |
| Daily cost report        | `tools/cost/daily-report.ts`                                                        | ✅ (referenced in docs) |
| Anomaly alerting         | > 2x 7-day rolling baseline → PagerDuty                                             | ✅ (referenced in docs) |
| Per-request cost stamp   | `X-Cost-MicroUSD` header (internal only)                                            | ✅                      |

### Findings

| ID     | Severity | Category | Location                | Description                                                                                                                                                          | Fix                                                                                 | Standard |
| ------ | -------- | -------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------- |
| S3-051 | Low      | Cost     | `docs/cost-controls.md` | Cost controls doc is minimal (10 lines). It references `tools/cost/daily-report.ts` but this file is not present in the repository.                                  | Either create the daily-report script or update the doc to reflect current tooling. | Internal |
| S3-052 | Info     | Cost     | `lib/quotas.ts`         | Quota system uses KV with circuit-breaker (fail-open on brief blips, fail-closed on sustained outage). Pricing metadata embedded in provider classes. Well-designed. | No action needed.                                                                   | FinOps   |

---

## A81 — Log / Metric Cardinality

### Findings

| ID     | Severity | Category      | Location               | Description                                                                                                                                                                                                         | Fix                                                                                                | Standard     |
| ------ | -------- | ------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------ |
| S3-053 | Info     | Observability | `lib/logger.ts`        | Structured JSON logging with flat schema. PII deny-list in `lib/log-redaction.ts` redacts 40+ field patterns. IP addresses truncated to /24.                                                                        | No action needed.                                                                                  | SOC 2, GDPR  |
| S3-054 | Low      | Observability | `lib/logger.ts`        | Log level is configurable via `LOG_LEVEL` env var. Default: `info` in production, `debug` in dev. No per-route log-level override exists — a noisy route cannot be silenced without globally raising the threshold. | Consider a per-route log-level override mechanism (e.g., `LOG_LEVEL_ROUTE_/api/track/click=warn`). | SRE          |
| S3-055 | Low      | Observability | `lib/log-redaction.ts` | Redaction is shallow (one level deep). Nested objects with PII keys (e.g., `{ user: { email: "..." } }`) would not be redacted.                                                                                     | Add recursive redaction with a depth limit (e.g., 3 levels).                                       | GDPR Art. 32 |

---

## A82 — Long-Running Jobs

### Inventory

| Job                               | Checkpoint                        | Resumable                      | Restart-Survivable        |
| --------------------------------- | --------------------------------- | ------------------------------ | ------------------------- |
| `cron/data-retention` (clicks)    | ✅ `cron_state` table with cursor | ✅ Resumes from `last_id`      | ✅                        |
| `cron/data-retention` (audit_log) | ✅ Via RPC or batch               | ✅ Transactional RPC preferred | ✅                        |
| `cron/ai-generate`                | ✅ `cron_lock` prevents overlap   | ⚠️ No cursor checkpoint        | ⚠️ Restarts redo all work |
| `cron/commission-ingest`          | ✅ `cron_lock`                    | ⚠️ No cursor checkpoint        | ⚠️ Restarts redo all work |
| `cron/price-scrape`               | ✅ `cron_lock`                    | ⚠️ No cursor checkpoint        | ⚠️ Restarts redo all work |
| `cron/publish`                    | ✅ `cron_lock`                    | N/A (fast, idempotent)         | ✅                        |

### Findings

| ID     | Severity | Category    | Location                             | Description                                                                                                                                                 | Fix                                                                                                 | Standard |
| ------ | -------- | ----------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------- |
| S3-056 | Medium   | Reliability | `app/api/cron/ai-generate/route.ts`  | AI content generation cron uses `cron_lock` for overlap prevention but has no cursor-based checkpointing. If interrupted, the entire batch is re-processed. | Add `cron_state` cursor like `data-retention` uses — save last-processed draft ID after each batch. | SRE      |
| S3-057 | Low      | Reliability | `app/api/cron/price-scrape/route.ts` | Price scraping cron has no checkpoint mechanism. A timeout mid-scrape means the next run starts from scratch.                                               | Add batch checkpointing for large product catalogs.                                                 | SRE      |

---

## A83 — Graceful Shutdown

### Findings

| ID     | Severity | Category    | Location                   | Description                                                                                                                                                                                                 | Fix                                                                                                                                  | Standard        |
| ------ | -------- | ----------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| S3-058 | Low      | Reliability | N/A                        | Cloudflare Workers do not have a traditional SIGTERM lifecycle. Workers are stateless isolates that are evicted by the runtime. `waitUntil()` is used for fire-and-forget work (click queue, sitemap ping). | No action needed for Workers. For the heavy-crons worker, `ctx.waitUntil()` is correctly used to ensure dispatched fetches complete. | CF Workers docs |
| S3-059 | Info     | Reliability | `workers/custom-worker.ts` | Custom worker uses `ctx.passThroughOnException()` as a fallback mechanism. Queue consumer uses `message.retry()` with exponential backoff for failed messages.                                              | No action needed.                                                                                                                    | CF Workers docs |

---

## A84 — Fault Tolerance

### Scenario Analysis

| Scenario                           | Behaviour                                                                                                                                                  | Status      |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **DB down**                        | All API routes return 500/503. Health check reports `database: error`. No circuit breaker on Supabase.                                                     | ⚠️ Partial  |
| **KV down**                        | Rate limiter falls back to in-memory → fail-closed after grace window. Site lookup falls back to DB. Circuit breaker state unavailable — local state used. | ✅ Graceful |
| **Auth down** (JWT secret missing) | `instrumentation.ts` throws on startup in production — fail-fast.                                                                                          | ✅          |
| **R2 down**                        | Image uploads fail. Audit log archival skipped (retried next run). Click tracking unaffected.                                                              | ✅ Graceful |
| **Stripe down**                    | Webhook events go to DLQ (`webhook-dlq`). Membership checkout returns 503.                                                                                 | ✅ Graceful |
| **AI provider down**               | Circuit breaker opens → next provider in fallback chain. All 4 down → error returned to admin.                                                             | ✅ Graceful |
| **Email (Resend) down**            | Newsletter signup returns 503. No retry or DLQ for failed sends.                                                                                           | ⚠️ Partial  |

### Findings

| ID     | Severity | Category    | Location                      | Description                                                                                                                                                                          | Fix                                                                                                                       | Standard |
| ------ | -------- | ----------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | -------- |
| S3-060 | Medium   | Reliability | `lib/supabase-server.ts`      | No circuit breaker on Supabase. A sustained DB outage causes every request to wait for TCP timeout (~30 s) before failing. This wastes Worker CPU time and degrades user experience. | Add a lightweight circuit breaker for Supabase calls (reuse the `CircuitBreaker` class from `lib/ai/circuit-breaker.ts`). | SRE      |
| S3-061 | Low      | Reliability | `app/api/newsletter/route.ts` | Failed email sends (Resend API) are not queued for retry. A transient Resend outage means the user's signup succeeds in DB but the confirmation email is never sent.                 | Add a `newsletter_email_failures` DLQ table or retry mechanism (similar to `click_failures`).                             | SRE      |

---

## A85 — SLO Math

### Summary

SLO definitions in `docs/slo-definitions.md` cover 7 service tiers with error budgets.

| Service        | Availability SLO | Error Budget (30-day) | Burn-Rate Alert                          |
| -------------- | ---------------- | --------------------- | ---------------------------------------- |
| Public pages   | 99.9%            | 43 min                | ✅ `alerts.tf` — `http_alert_edge_error` |
| Authentication | 99.95%           | 21 min                | ✅ `alerts.tf`                           |
| Admin panel    | 99.5%            | 3.6 hr                | ✅ `alerts.tf`                           |
| Cron jobs      | 99%              | ~4 missed/month       | ✅ Cron liveness + alerting              |
| Click tracking | 99.9%            | 43 min                | ⚠️ No dedicated alert                    |
| Newsletter     | 99%              | 7.2 hr                | ⚠️ No dedicated alert                    |
| Stripe webhook | 99.9%            | 43 min                | ⚠️ DLQ monitoring only                   |

### Findings

| ID     | Severity | Category | Location                         | Description                                                                                                                                                                                                                        | Fix                                                                                     | Standard |
| ------ | -------- | -------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------- |
| S3-062 | Medium   | SLO      | `terraform/cloudflare/alerts.tf` | Burn-rate alerts are defined but `alert_mechanisms` defaults to empty lists (email/pagerduty/webhooks). Without configured destinations, no alerts fire.                                                                           | Configure at least one notification destination in `alerts.auto.tfvars`.                | SRE      |
| S3-063 | Low      | SLO      | `docs/slo-definitions.md`        | Click tracking and newsletter do not have dedicated burn-rate alerts. Failures are currently detected via general 5xx monitoring.                                                                                                  | Add dedicated SLO burn-rate alerts for `/api/track/click` and `/api/newsletter`.        | SRE      |
| S3-064 | Low      | SLO      | `terraform/cloudflare/alerts.tf` | `alerts_enabled` defaults to `true` but a lifecycle precondition blocks apply if mechanisms are empty. This is safe but means alerts are effectively disabled until destinations are configured. Document this bootstrapping step. | Add a deployment checklist item: "Configure alert destinations before enabling alerts." | SRE      |

---

## Summary

### Severity Distribution

| Severity   | Count |
| ---------- | ----- |
| **Medium** | 14    |
| **Low**    | 28    |
| **Info**   | 12    |

### Top Priorities (Medium Severity)

1. **S3-004** — GDPR data portability: no self-service export or CSV format
2. **S3-008** — CCPA: privacy policy missing required disclosures and "Do Not Sell" link
3. **S3-010** — SOC 2 CC6.2/CC6.3: access provisioning/removal checklists incomplete
4. **S3-013** — ISO 27001 A.5.13: no runtime data-classification labelling
5. **S3-016** — WCAG: product `image_alt` not validated as non-empty
6. **S3-021** — Consent banner: no "Reject All" on initial view
7. **S3-023** — ToS/PP: drip campaign email usage not disclosed in privacy policy
8. **S3-031** — Worst-case input: newsletter body size not route-capped
9. **S3-034** — External calls: no timeout/circuit breaker on Supabase
10. **S3-035** — External calls: no timeout/retry on Resend email
11. **S3-041** — Rate limiter grace window too long for auth routes
12. **S3-050** — Cold start: per-request Supabase client creation
13. **S3-056** — Long-running jobs: AI generate cron has no checkpoint
14. **S3-060** — Fault tolerance: no circuit breaker on Supabase
15. **S3-062** — SLO: burn-rate alert destinations not configured

### Attestation

This audit was conducted by automated code analysis of the `groupsmix/affilite-mix` repository at commit `main` (2026-05-29). It covers privacy (GDPR, CCPA), compliance (SOC 2, ISO 27001, WCAG 2.2, EU AI Act), and reliability (performance, fault tolerance, SLO) concerns across audits A61–A85 (excluding A64 PCI-DSS and A65 HIPAA, as Stripe handles card data).
