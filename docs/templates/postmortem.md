# Incident Postmortem Template

## Incident Title

_One-line summary_

## Severity

- [ ] SEV-1 (full outage / data breach)
- [ ] SEV-2 (partial outage / degraded service)
- [ ] SEV-3 (minor impact / no user-facing effect)

## Timeline

| Time (UTC) | Event                   |
| ---------- | ----------------------- |
| HH:MM      | First alert / detection |
| HH:MM      | Investigation started   |
| HH:MM      | Root cause identified   |
| HH:MM      | Mitigation applied      |
| HH:MM      | Full resolution         |

## 5 W's

- **What** happened?
- **Who** was affected? (users, tenants, internal systems)
- **When** did it start and end? (duration)
- **Where** did it occur? (service, region, component)
- **Why** did it happen? (root cause)

## Impact

- Users affected:
- Revenue impact:
- Data impact:
- SLA impact:

## Root Cause

_Detailed technical explanation._

## Detection

How was the incident detected? (alert, user report, manual discovery)

What monitoring gaps allowed the incident to persist?

## Resolution

Steps taken to resolve the incident.

## Action Items

| #   | Action                     | Owner | Deadline   | Status  |
| --- | -------------------------- | ----- | ---------- | ------- |
| 1   | _e.g. Add regression test_ |       | YYYY-MM-DD | Pending |
| 2   | _e.g. Fix monitoring gap_  |       | YYYY-MM-DD | Pending |
| 3   | _e.g. Update runbook_      |       | YYYY-MM-DD | Pending |

## Follow-Up Review

- **Review date:** YYYY-MM-DD
- **Reviewer:**
- **All action items closed?** Yes / No
