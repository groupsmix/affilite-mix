# Shadow IT Discovery Process

> **A185 Remediation** — Lightweight SaaS discovery and unauthorized tool detection.
> **Last updated:** 2026-05-29

---

## Overview

Shadow IT refers to any SaaS application, API integration, browser extension, or automation account used by team members without explicit organizational approval. For a small team, a quarterly manual review is sufficient.

---

## 1. Quarterly Discovery Checklist

Perform the following checks at the start of each quarter (aligned with access recertification in `docs/access-recertification.md`).

### 1a. OAuth App Grants (GitHub)

1. Navigate to GitHub Organization → Settings → OAuth application policy.
2. Review all approved OAuth applications.
3. Revoke any application that is:
   - No longer actively used
   - Not in the approved vendor list (`docs/vendor-dpas.md`)
   - Requesting excessive scopes

### 1b. OAuth App Grants (Google Workspace / Gmail)

1. Navigate to Google Admin → Security → API Controls → App Access Control.
2. Review third-party app access.
3. Revoke any unapproved app with access to organization email or drive.

### 1c. Browser Extensions Audit

1. Request each team member to export their browser extension list (chrome://extensions/).
2. Flag any extension that:
   - Has access to `*.supabase.co`, `*.cloudflare.com`, or `*.stripe.com`
   - Is not from a verified publisher
   - Requests broad host permissions (`<all_urls>`)

### 1d. DNS / Subdomain Review

1. Export current DNS records: `terraform plan` against `terraform/cloudflare/dns.tf`.
2. Compare against the IaC source of truth.
3. Flag any records not managed by Terraform (Dashboard-routed domains per A206).

### 1e. Expense Report Review

1. Review monthly expense reports for any SaaS subscriptions.
2. Cross-reference against the approved vendor list.
3. Flag unapproved tools for review and onboarding into vendor management.

### 1f. Unauthorized AI Tool Detection

1. Review GitHub audit logs for any commits mentioning AI tools not in `docs/ai-governance.md`.
2. Check for any API keys in CI/CD secrets that correspond to unapproved AI providers.
3. Survey team members on any personal AI tool usage for work tasks.

---

## 2. Approved Tool Categories

| Category             | Approved Tools                                                            | Policy                                                                         |
| -------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| AI / LLM             | Cloudflare AI, Google Gemini, Groq, Cohere (see `docs/vendor-dpas.md` §6) | Must use platform's fallback chain; no direct API calls from personal accounts |
| Code hosting         | GitHub                                                                    | Organization-managed repos only                                                |
| CI/CD                | GitHub Actions                                                            | No external CI services without security review                                |
| Communication        | Slack, Email                                                              | No unapproved messaging platforms for work discussions                         |
| Cloud infrastructure | Cloudflare, Supabase, Stripe                                              | All access via org accounts with MFA                                           |

---

## 3. Discovery Log

| Quarter    | Reviewer | Findings | Actions Taken | Date |
| ---------- | -------- | -------- | ------------- | ---- |
| (none yet) |          |          |               |      |

---

## 4. Escalation

If unauthorized tools are discovered:

1. Assess data exposure risk (did customer/PII data flow through the tool?).
2. If yes, invoke `docs/incident-response.md` for potential data breach assessment.
3. If no, add to vendor evaluation pipeline or block and notify the user.
4. Update `docs/vendor-dpas.md` if the tool is approved after review.
