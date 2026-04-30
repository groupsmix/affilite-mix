# Red Team Rules of Engagement (ROE)

> **Audit reference**: A205 (Red-Team Plan)
> **Last updated**: 2026-04-30
> **Status**: DRAFT -- must be reviewed and signed off by security lead before any engagement

---

## 1. Engagement Window

| Parameter          | Value                                         |
| ------------------ | --------------------------------------------- |
| Duration           | 5 business days                               |
| Hours              | 09:00-17:00 UTC                               |
| Emergency stop     | Contact on-call via `#red-team-channel` Slack  |
| Kickoff notice     | 30 minutes before first external request       |

---

## 2. Scope

### In Scope

- Production hostnames: `wristnerd.xyz`, `arabictools.wristnerd.xyz`, `crypto.wristnerd.xyz`
- Additional custom domains: `cryptoranked.xyz`, `aicompared.site`
- Staging Worker (if deployed)
- Non-PII synthetic test tenant (created specifically for the engagement)
- All public API endpoints listed in the attack-surface map
- CI/CD pipeline (GitHub Actions, deploy workflows)
- Terraform/IaC configuration review

### Out of Scope

- DoS / volumetric flood attacks
- Client-of-customer assets
- Upstream provider infrastructure: Supabase, Cloudflare, Stripe, Resend, Sentry, GitHub
- Physical access testing
- Real customer data or production tenant data
- Social engineering of non-org mailboxes

---

## 3. Authorized Techniques

| Category                     | Techniques                                                        |
| ---------------------------- | ----------------------------------------------------------------- |
| Web application              | OWASP Top 10 (injection, broken auth, XSS, SSRF, CSRF, etc.)     |
| ATT&CK Enterprise            | Initial access, privilege escalation, lateral movement chains     |
| Cloud (Cloudflare-specific)  | Worker secret enumeration, KV/R2 binding abuse, `workers.dev` bypass |
| AI red team (A214)           | Prompt injection, jailbreak, system-prompt extraction, indirect injection |
| Authentication               | Credential stuffing (synthetic creds only), MFA bypass attempts   |
| API testing                  | Fuzzing, parameter tampering, rate-limit bypass                   |

---

## 4. Unauthorized Techniques

- Privilege escalation against real customers' tenants
- Reading or exfiltrating real PII
- Modifying production data (outside the synthetic test tenant)
- Exfiltration to non-org-controlled infrastructure
- Social engineering of staff without separate written approval
- Supply-chain attacks against dependencies (notify maintainers instead)
- Attacking third-party SaaS providers directly

---

## 5. Success Criteria (Test Fail Conditions)

A finding is classified as a **test failure** if any of the following are demonstrated:

| ID   | Condition                                                              | Severity |
| ---- | ---------------------------------------------------------------------- | -------- |
| SF-1 | Cross-tenant data read or write                                        | Critical |
| SF-2 | Admin remote code execution                                            | Critical |
| SF-3 | RLS bypass without service-role key                                    | Critical |
| SF-4 | Cost burn >= $100 from one tenant in < 1 hour (denial-of-wallet)       | High     |
| SF-5 | AI jailbreak success rate >= 10% on the internal evaluation set         | High     |
| SF-6 | Authentication bypass (admin session without valid credentials)         | Critical |
| SF-7 | Persistent XSS that survives content sanitization                      | High     |

---

## 6. Deconfliction

- All external requests from the red team **must** carry the header:
  `X-RedTeam-Run-ID: <uuid>`
- The run ID must be allowlisted in the Cloudflare WAF before the engagement starts
- On-call is paged via `#red-team-channel` 30 minutes before kickoff
- If any production impact is observed, the red team halts immediately and notifies the incident commander
- Red team traffic should be distinguishable in logs via the run ID header

---

## 7. Reporting

| Artifact                    | Format                                         | Deadline              |
| --------------------------- | ---------------------------------------------- | --------------------- |
| Daily progress update       | Slack message in `#red-team-channel`            | End of each test day  |
| Final report                | Markdown in `docs/incidents/YYYY-MM-DD-redteam.md` | 5 business days after engagement |
| Retest report               | Same format as final report                    | 30 days after remediation |

### Finding Format

Each finding must include:

- **Title**: Brief description
- **CVSS 3.1 score**: Base score with vector string
- **ATT&CK ID**: Mapped technique(s)
- **Reproduction steps**: Detailed, with curl/HTTP examples
- **Impact**: Business and technical impact
- **Recommendation**: Specific remediation steps
- **Evidence**: Screenshots, HTTP transcripts, log excerpts

---

## 8. ATT&CK Matrices Applied

| Matrix              | Applicability |
| ------------------- | ------------- |
| Enterprise          | Primary       |
| Cloud (Cloudflare)  | Primary       |
| Cloud (Supabase)    | Secondary     |
| Mobile              | N/A           |
| ICS                 | N/A           |

---

## 9. Legal and Compliance

- This engagement must be authorized in writing by the repository owner before execution
- All findings are confidential and shared only with the security team
- The red team must not retain copies of any data accessed during testing beyond what is needed for the report
- Evidence of vulnerabilities must be securely deleted 90 days after the retest report is accepted

---

## 10. Retest Cadence

- **Initial retest**: 30 calendar days after remediation of Critical/High findings
- **Quarterly mini-engagement**: 2-day focused test on previously identified attack vectors
- **Annual full engagement**: 5-day engagement covering the complete scope above
