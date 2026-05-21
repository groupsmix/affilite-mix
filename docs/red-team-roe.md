# Red-Team Rules of Engagement

This document defines the default rules of engagement (ROE) for adversary simulation against `affilite-mix`. It is a standing baseline; every live exercise must still receive written approval from the business owner, legal/contact owner, and incident commander before kickoff.

## Engagement baseline

| Section | Baseline |
| --- | --- |
| Engagement window | 5 business days, 09:00–17:00 UTC, unless a signed exercise plan says otherwise. |
| Scope in | Production hostnames listed in `affilite-mix-redteam-audit.md`, staging Worker, and a non-PII synthetic test tenant. |
| Scope out | DoS/volumetric flood, customer-owned assets, provider infrastructure (Supabase, Cloudflare, Stripe, Resend, Sentry, GitHub), physical access, and real-user PII access. |
| Authorized techniques | OWASP Top 10, MITRE ATT&CK Enterprise initial-access / privilege-escalation paths, Cloudflare/Supabase cloud-control checks, and AI red-team prompts against approved synthetic data. |
| Social engineering | Requires separate written approval, named target cohorts, pre-briefed deconfliction contacts, and a legal/HR-approved phish-sim plan. |
| Unauthorized techniques | Privilege escalation against real customer tenants, reading or exporting real PII, modifying production data, persistence outside test accounts, malware, destructive payloads, and exfiltration to non-org infrastructure. |
| Success criteria / test fail | Cross-tenant read/write; admin RCE; RLS bypass without service-role key; cost burn ≥ USD 100 from one tenant in less than 1 hour; AI jailbreak success ≥ 10% on internal eval; unauthorized cloud control-plane mutation. |
| Deconfliction | All external requests must carry `X-RedTeam-Run-ID: <uuid>` where tooling supports it. The run ID, source IPs, test accounts, and planned windows must be posted to the incident/on-call channel 30 minutes before kickoff. |
| Reporting | Final report lands in `docs/incidents/YYYY-MM-DD-redteam.md` or the approved GRC system. Findings include CVSS 3.1, affected assets, evidence, ATT&CK IDs, owner, due date, and retest status. |
| Retest cadence | Critical/high findings: retest within 30 days. Medium findings: retest within 60 days. Low findings: verify in the next scheduled exercise. |
| ATT&CK matrices | Enterprise primary; Cloud for Cloudflare/Supabase/GitHub control-plane paths. Mobile and ICS are not applicable unless the product scope changes. |

## Required pre-flight checklist

- [ ] Exercise owner approved scope, test accounts, and schedule.
- [ ] Legal/HR approved any social-engineering component.
- [ ] On-call and incident commander have the run ID, source IPs, and emergency stop contact.
- [ ] Synthetic test tenant exists and contains no real user PII.
- [ ] Cloudflare WAF/observability has a temporary allowlist or label for the run ID/source IPs where appropriate.
- [ ] Sentry/Cloudflare alert destinations are live or the exercise is explicitly marked as tabletop/static only.
- [ ] Rollback / emergency stop procedure is confirmed.

## Emergency stop

Any authorized employee may call stop if the exercise risks customer impact, production data integrity, third-party provider terms, or legal/regulatory exposure. On stop:

1. Red-team activity ceases immediately.
2. The incident commander records the stop time and reason.
3. All active test credentials/tokens are revoked.
4. Any production mutations are reverted or documented for owner approval.
5. The report includes the stop event and affected test steps.
