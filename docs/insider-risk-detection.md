# Insider Risk & UEBA Detection Plan

> **A184 Remediation** — Minimum viable insider-risk telemetry and anomaly detection rules.
> **Status:** Plan documented; implementation pending log-shipper enablement (A188).
> **Last updated:** 2026-05-29

---

## Overview

This document defines the detection rules and alerting thresholds for insider-risk and User and Entity Behavior Analytics (UEBA). These controls assume centralized logging is operational (see `docs/observability-runbook.md` and A188 log-shipper enablement).

---

## 1. Detection Rules

### 1a. Cloudflare (via Logpush → R2/SIEM)

| Rule ID  | Signal                                                            | Threshold                                               | Action                                      |
| -------- | ----------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------- |
| IR-CF-01 | High-volume `track` (click) API calls from a single admin session | > 500 requests / 5 min                                  | Alert on-call; auto-block session if > 2000 |
| IR-CF-02 | Admin API reads outside business hours (00:00–06:00 UTC)          | Any admin read                                          | Log + alert (informational)                 |
| IR-CF-03 | Bulk KV list/read operations                                      | > 100 KV reads / min from a single source               | Alert on-call                               |
| IR-CF-04 | Worker deployment from non-CI source                              | Any `wrangler publish` not from GitHub Actions IP range | Alert + page security lead                  |

### 1b. GitHub (via Audit Log API)

| Rule ID  | Signal                                          | Threshold                              | Action                          |
| -------- | ----------------------------------------------- | -------------------------------------- | ------------------------------- |
| IR-GH-01 | Bulk repository clone                           | > 3 repos cloned by one user in 1 hour | Alert security lead             |
| IR-GH-02 | Branch protection rule change                   | Any change                             | Alert + require second approval |
| IR-GH-03 | New deploy key or PAT created                   | Any creation                           | Alert security lead             |
| IR-GH-04 | CODEOWNERS file modified outside of approved PR | Direct push                            | Block + alert                   |

### 1c. Supabase (via Database Audit Logs)

| Rule ID  | Signal                                               | Threshold                                                                                      | Action                   |
| -------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------ |
| IR-SB-01 | Broad `SELECT *` on production tables                | Any `SELECT` without `WHERE` clause on `admin_users`, `click_events`, `newsletter_subscribers` | Alert on-call            |
| IR-SB-02 | Data export volume spike                             | > 10,000 rows returned in a single query session                                               | Alert security lead      |
| IR-SB-03 | `service_role` key used outside Worker runtime       | Any connection from non-Worker IP                                                              | Alert + page immediately |
| IR-SB-04 | Schema modification (DDL) outside migration pipeline | Any `ALTER TABLE`, `DROP`, `CREATE` from non-migration source                                  | Alert + block            |

---

## 2. Implementation Phases

### Phase 1 — Log Collection (prerequisite: A188)

1. Enable Cloudflare Logpush to immutable R2 bucket (see `docs/log-retention-worm.md`).
2. Configure GitHub audit log streaming to the same SIEM/R2 destination.
3. Enable Supabase `pgaudit` extension for query-level logging.

### Phase 2 — Rule Deployment

1. Deploy alerting rules above as SIEM queries (or Cloudflare Notification policies for CF-native signals).
2. Configure PagerDuty routing for each severity level.
3. Test each rule with synthetic events.

### Phase 3 — Tuning & Baseline

1. Run rules in alert-only (non-blocking) mode for 30 days.
2. Establish normal baselines for each metric.
3. Tune thresholds based on observed false-positive rates.
4. Graduate to blocking mode for critical rules (IR-CF-04, IR-SB-03, IR-SB-04).

---

## 3. Response Procedures

When an insider-risk alert fires:

1. **Do not alert the subject** until investigation confirms or clears the activity.
2. Invoke `docs/incident-response.md` Phase 1 with severity based on data sensitivity.
3. Preserve all logs under legal hold (see `incident-response.md` Phase 6).
4. Engage HR and legal counsel before any personnel action.

---

## 4. MITRE ATT&CK Mapping (A208)

Each detection rule maps to one or more ATT&CK technique IDs for purple-team validation:

| Rule ID  | ATT&CK Technique                                                  | Tactic                       |
| -------- | ----------------------------------------------------------------- | ---------------------------- |
| IR-CF-01 | T1567 — Exfiltration Over Web Service                             | Exfiltration                 |
| IR-CF-02 | T1078.004 — Valid Accounts: Cloud Accounts                        | Persistence, Privilege Escalation |
| IR-CF-03 | T1530 — Data from Cloud Storage                                   | Collection                   |
| IR-CF-04 | T1059.009 — Command and Scripting: Cloud API                      | Execution                    |
| IR-GH-01 | T1213.003 — Data from Information Repositories: Code Repositories | Collection                   |
| IR-GH-02 | T1098.001 — Account Manipulation: Additional Cloud Credentials    | Persistence                  |
| IR-GH-03 | T1098.001 — Account Manipulation: Additional Cloud Credentials    | Persistence                  |
| IR-GH-04 | T1078 — Valid Accounts                                            | Defense Evasion              |
| IR-SB-01 | T1530 — Data from Cloud Storage                                   | Collection                   |
| IR-SB-02 | T1041 — Exfiltration Over C2 Channel                              | Exfiltration                 |
| IR-SB-03 | T1078.004 — Valid Accounts: Cloud Accounts                        | Initial Access               |
| IR-SB-04 | T1565.001 — Data Manipulation: Stored Data Manipulation           | Impact                       |

**A208-F1 — Purple-team validation:** Once log collection (Phase 1) is operational, run synthetic attack simulations for each ATT&CK technique above. Measure MTTA (Mean Time to Alert) and MTTR (Mean Time to Respond) for each. Target: MTTA < 15 minutes for Critical rules (IR-CF-04, IR-SB-03, IR-SB-04), < 1 hour for all others.

---

## 5. Metrics & Reporting

Report quarterly to the board cyber dashboard (`docs/board-cyber-metrics.md`, A203):

- Number of insider-risk alerts triggered
- False positive rate (target: < 10%)
- Mean time to investigate (target: < 4 hours)
- Number of confirmed incidents (target: 0)
