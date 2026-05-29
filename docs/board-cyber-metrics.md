# Board-Level Cyber Risk Metrics Dashboard

> **A203 Remediation** — Quarterly metrics report for executive/board visibility.
> **Last updated:** 2026-05-29

---

## 1. Purpose

This document defines the quarterly cyber risk metrics to be reported to the board or executive leadership. Metrics are sourced from existing tools (grype, Sentry, post-mortems, training records, recertification logs) and aggregated here.

---

## 2. Key Metrics

### 2a. Vulnerability Management

| Metric                              | Source                            | Target | Current |
| ----------------------------------- | --------------------------------- | ------ | ------- |
| Critical CVEs open > 7-day SLA      | grype scan output (`.grype.yaml`) | 0      | —       |
| High CVEs open > 30-day SLA         | grype scan output                 | 0      | —       |
| SBOM completeness                   | `ci.yml` CycloneDX output         | 100%   | —       |
| Dependency freshness (% up-to-date) | Dependabot / Renovate             | > 90%  | —       |

### 2b. Incident Response

| Metric                        | Source                                     | Target                        | Current |
| ----------------------------- | ------------------------------------------ | ----------------------------- | ------- |
| MTTD (Mean Time to Detect)    | Sentry alert timestamps vs. incident start | < 15 min                      | —       |
| MTTR (Mean Time to Respond)   | Incident log timestamps                    | < 1 hour (P0), < 4 hours (P1) | —       |
| MTTC (Mean Time to Contain)   | Post-mortem action-item closure            | < 24 hours                    | —       |
| Open post-mortem action items | Post-mortem docs (`docs/post-mortems/`)    | 0 overdue                     | —       |
| Incidents this quarter        | Incident log                               | Trending down                 | —       |

### 2c. Access & Identity

| Metric                              | Source                            | Target           | Current |
| ----------------------------------- | --------------------------------- | ---------------- | ------- |
| Access recertification completed    | `docs/access-recertification.md`  | 100% on schedule | —       |
| Stale accounts (> 90 days inactive) | GitHub/CF/Supabase audit logs     | 0                | —       |
| MFA enforcement coverage            | `docs/org-security.md` checkboxes | 100%             | —       |
| CODEOWNERS teams ≥ 2 members        | `.github/CODEOWNERS` teams        | 100%             | —       |

### 2d. Training & Awareness

| Metric                         | Source                           | Target | Current |
| ------------------------------ | -------------------------------- | ------ | ------- |
| Training completion %          | `docs/workforce-training-log.md` | 100%   | —       |
| Phishing simulation click rate | `docs/workforce-training-log.md` | < 5%   | —       |
| Overdue training count         | Training log                     | 0      | —       |

### 2e. Supply Chain

| Metric                     | Source                             | Target               | Current |
| -------------------------- | ---------------------------------- | -------------------- | ------- |
| Vendor DPA coverage        | `docs/vendor-dpas.md`              | 100% Tier 1-2        | —       |
| SOC 2/ISO evidence current | `docs/vendor-dpas.md` expiry dates | 100% within validity | —       |
| Shadow IT findings         | `docs/shadow-it-discovery.md`      | 0 unapproved tools   | —       |

---

## 3. Top 10 Risk Register

| #   | Risk                                            | Likelihood | Impact   | Mitigation                                          | Trend     |
| --- | ----------------------------------------------- | ---------- | -------- | --------------------------------------------------- | --------- |
| 1   | Supply-chain compromise (malicious npm package) | Medium     | Critical | Socket.dev + npm audit + SBOM (A173/A174)           | Stable    |
| 2   | Insider data exfiltration                       | Low        | Critical | UEBA rules (A184, pending implementation)           | New       |
| 3   | Ransomware on production database               | Low        | Critical | PITR backups, DR drills, immutable logs (A188/A191) | Stable    |
| 4   | Cloudflare account takeover                     | Low        | Critical | MFA enforcement, scoped tokens (A179)               | Improving |
| 5   | Third-party AI data leakage                     | Low        | High     | No-PII policy, prompt sanitization (A214)           | Stable    |
| 6   | Unpatched dependency (known CVE)                | Medium     | High     | Dependabot + grype SLA enforcement (A174)           | Stable    |
| 7   | Phishing / credential theft                     | Medium     | High     | MFA + phishing sims (A186/A210)                     | New       |
| 8   | DNS hijacking / domain takeover                 | Low        | High     | IaC-managed DNS, DNSSEC (A206/A213)                 | Stable    |
| 9   | Stripe payment data exposure                    | Low        | High     | PCI DSS L1 (Stripe-managed), restricted keys        | Stable    |
| 10  | Regulatory non-compliance (GDPR fine)           | Low        | Medium   | DPA coverage, breach templates, ROPA (A190)         | Improving |

---

## 4. Quarterly Report Template

```markdown
# Cyber Risk Report — Q[N] [YEAR]

**Prepared by:** [Security Lead]
**Date:** [YYYY-MM-DD]

## Executive Summary

[2-3 sentences on overall posture and key changes]

## Metrics Dashboard

[Copy metrics from §2 above with current values filled in]

## Top Risks

[Copy risk register from §3 with updated trends]

## Key Events This Quarter

- [List incidents, near-misses, and significant security improvements]

## Action Items for Next Quarter

| Item | Owner | Due | Status |
| ---- | ----- | --- | ------ |
|      |       |     |        |
```

---

## 5. Reporting Cadence

- **Frequency:** Quarterly (first week of Jan / Apr / Jul / Oct, aligned with access recertification).
- **Distribution:** Board or executive leadership, Security Lead, Engineering Lead.
- **Format:** This markdown document updated in-repo + presentation deck as needed.
