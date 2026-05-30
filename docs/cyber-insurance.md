# Cyber Insurance Policy

> **A196 Remediation** — Cyber insurance evaluation and coverage documentation.
> **Status:** Not yet procured. This document tracks the evaluation process and requirements.
> **Last updated:** 2026-05-30

---

## 1. Why Cyber Insurance

Even with strong technical controls, residual risk remains from:

- Zero-day vulnerabilities in third-party dependencies
- Cloud provider outages beyond SLA coverage
- Sophisticated social engineering or insider attacks
- Regulatory fines (GDPR, CCPA) following a data breach
- Legal costs from breach notification and class-action defense

Cyber insurance transfers these residual risks to an insurer.

---

## 2. Recommended Coverage

| Coverage Type         | Minimum Limit | Rationale                                                     |
| --------------------- | ------------- | ------------------------------------------------------------- |
| Data breach response  | $1M           | Notification costs, credit monitoring, forensic investigation |
| Business interruption | $500K         | Revenue loss during extended Cloudflare/Supabase outage       |
| Regulatory defense    | $500K         | GDPR/CCPA enforcement actions, legal counsel                  |
| Media liability       | $250K         | Defamation claims from AI-generated or affiliate content      |
| Cyber extortion       | $250K         | Ransomware negotiation/payment (if ever authorized)           |
| Third-party liability | $1M           | Claims from affiliates or users due to platform breach        |

---

## 3. Evaluation Criteria

When selecting a policy, evaluate:

- [ ] **Coverage exclusions:** Ensure the policy does not exclude cloud-native architectures (serverless, edge compute).
- [ ] **Retroactive date:** Policy should cover incidents discovered after binding, even if the breach started before.
- [ ] **Sub-limits:** Verify sub-limits on forensics, notification, and regulatory defense are adequate.
- [ ] **Panel providers:** Check if the insurer mandates specific incident response firms (and whether they are adequate).
- [ ] **Waiting period:** For business interruption, confirm the waiting period (typically 8–12 hours) aligns with your RTO (4 hours per A191).
- [ ] **War exclusion:** Review the war/nation-state exclusion clause — ensure it does not blanket-exclude all APT activity.

---

## 4. Insurer Shortlist

| Insurer   | Product                | Estimated Premium | Notes                                            |
| --------- | ---------------------- | ----------------- | ------------------------------------------------ |
| Coalition | Active Cyber Insurance | TBD               | Includes free security scanning; good for SMBs   |
| At-Bay    | Cyber Insurance        | TBD               | Strong tech-sector focus                         |
| Corvus    | Smart Cyber Insurance  | TBD               | Automated underwriting based on security posture |

**Action:** Request quotes from at least 2 insurers. Provide them with:

- This document as evidence of security controls
- `SECURITY.md` (vulnerability disclosure policy)
- `docs/incident-response.md` (IR playbook)
- `docs/org-security.md` (org security controls)

---

## 5. Policy Tracking

| Field           | Value              |
| --------------- | ------------------ |
| Insurer         | (not yet selected) |
| Policy number   | —                  |
| Coverage period | —                  |
| Premium         | —                  |
| Renewal date    | —                  |
| Broker contact  | —                  |

---

## 6. Annual Review

Review the policy annually (or after any significant incident) to ensure:

1. Coverage limits remain adequate for current data volumes and revenue.
2. New services (e.g., payment processing, new AI providers) are covered.
3. Security control improvements are reported to the insurer for potential premium reduction.
4. Any claims or near-misses are documented and communicated to the broker.
