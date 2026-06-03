# Workforce Security Training Log

> **A186 Remediation** — Onboarding, annual, and role-based security training records.
> **Last updated:** 2026-05-29

---

## 1. Training Program Overview

### Required Training

| Training                        | Audience                      | Frequency           | Delivery                                         | Passing Score            |
| ------------------------------- | ----------------------------- | ------------------- | ------------------------------------------------ | ------------------------ |
| Security Awareness Fundamentals | All team members              | Annual + onboarding | Self-paced online module                         | 80%                      |
| Phishing Simulation             | All team members              | Quarterly           | Simulated phishing email campaign                | Click rate < 5% org-wide |
| Secure Coding Practices         | Developers                    | Annual              | Workshop or online module                        | 80%                      |
| Incident Response Tabletop      | On-call engineers + leads     | Quarterly           | Live exercise (see `docs/tabletop-exercises.md`) | Participation            |
| Data Privacy (GDPR/CCPA)        | All team members handling PII | Annual              | Self-paced online module                         | 80%                      |

### Role-Based Training

| Role            | Additional Training                                     | Frequency |
| --------------- | ------------------------------------------------------- | --------- |
| Security Lead   | Advanced threat intelligence, IR coordination           | Annual    |
| Platform/DevOps | Cloud security (Cloudflare Workers, Supabase hardening) | Annual    |
| Finance/Billing | PCI DSS awareness, Stripe security best practices       | Annual    |

---

## 2. Training Completion Log

Record each completed training cycle below. Link to the LMS/tool export as evidence.

| Date                       | Training | Completion % | Participants | Evidence Link | Next Due |
| -------------------------- | -------- | ------------ | ------------ | ------------- | -------- |
| (no training recorded yet) |          |              |              |               |          |

---

## 3. Phishing Simulation Log

| Date                         | Simulation Tool | Emails Sent | Click Rate | Report Rate | Action Items | Next Sim Due |
| ---------------------------- | --------------- | ----------- | ---------- | ----------- | ------------ | ------------ |
| (no simulation recorded yet) |                 |             |            |             |              |              |

**Target metrics:**

- Click rate: < 5% organization-wide
- Report rate: > 70% (users reporting the phishing email via the report button)
- Any individual who clicks twice in consecutive simulations receives mandatory 1-on-1 coaching.

---

## 4. Onboarding Checklist

New team members must complete the following within their first 2 weeks:

- [ ] Security Awareness Fundamentals module
- [ ] Read `SECURITY.md` and `docs/incident-response.md`
- [ ] Read `docs/org-security.md` and configure laptop hardening per §4
- [ ] Set up hardware MFA (WebAuthn/FIDO2) for GitHub, Cloudflare, Supabase
- [ ] Review `CONTRIBUTING.md` DCO and PIIA requirements
- [ ] Acknowledge the Code of Conduct (`docs/code-of-conduct.md`)

---

## 5. Security Reporting Hotline (A186-F2)

Team members can report security concerns through the following channels:

- **Email:** `security@groupsmix.com` — monitored by the security lead, response within 24 hours.
- **Slack:** `#security-reports` channel — for non-sensitive reports; use email for anything involving credentials or PII.
- **Anonymous:** Use the anonymous reporting form at `[INTERNAL_FORM_URL]` — for concerns that require confidentiality (e.g., insider behavior, policy violations).

All reports are tracked in `docs/open-investigations.md` and triaged per `docs/incident-response.md`.

---

## 6. Reporting

Training metrics feed into the quarterly board cyber dashboard (`docs/board-cyber-metrics.md`, A203):

- Training completion % (target: 100%)
- Phishing simulation click rate (target: < 5%)
- Overdue training count (target: 0)
