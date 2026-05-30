# Employee / Contractor Exit Checklist

> **A183-F3** — Signed exit checklist template for departing team members.
> **Owner:** Engineering Lead
> **SLA:** All access revoked within 1 hour of departure (A179-F3).

---

## Departing Member Information

| Field            | Value                                                           |
| ---------------- | --------------------------------------------------------------- |
| Name             |                                                                 |
| Role             |                                                                 |
| Last working day |                                                                 |
| Departure type   | ☐ Voluntary resignation ☐ Termination ☐ Contract end ☐ Transfer |
| Exit interview   | ☐ Completed ☐ Waived                                            |

---

## Access Revocation (within 1 hour)

| System           | Action                               | Completed | By  | Date |
| ---------------- | ------------------------------------ | --------- | --- | ---- |
| GitHub           | Remove from `groupsmix` organization | ☐         |     |      |
| Cloudflare       | Remove from account members          | ☐         |     |      |
| Supabase         | Remove from project team             | ☐         |     |      |
| Stripe           | Remove dashboard access              | ☐         |     |      |
| Sentry           | Remove from organization             | ☐         |     |      |
| Resend           | Remove dashboard access              | ☐         |     |      |
| Slack            | Deactivate account                   | ☐         |     |      |
| Google Workspace | Suspend account (if applicable)      | ☐         |     |      |
| PagerDuty        | Remove from on-call rotation         | ☐         |     |      |

---

## Credential Rotation

| Secret                            | Rotated? | Rotation date |
| --------------------------------- | -------- | ------------- |
| Shared secrets accessed by member | ☐        |               |
| SSH keys removed from infra       | ☐        |               |
| API tokens revoked                | ☐        |               |

See `docs/secrets-rotation-runbook.md` for rotation procedures.

---

## Device & Data

| Item                                             | Completed | Notes |
| ------------------------------------------------ | --------- | ----- |
| Company device(s) returned                       | ☐         |       |
| Full-disk encryption verified on returned device | ☐         |       |
| Personal device company data wiped (if BYOD)     | ☐         |       |
| Code / repos removed from personal devices       | ☐         |       |

---

## Code & Access Audit

| Item                                                          | Completed | Notes |
| ------------------------------------------------------------- | --------- | ----- |
| Review last 30 days of commits by departing member            | ☐         |       |
| Review last 30 days of Cloudflare audit log for their actions | ☐         |       |
| Review GitHub audit log for repo/org actions                  | ☐         |       |
| Update CODEOWNERS if member was listed                        | ☐         |       |

---

## Legal & Compliance

| Item                                      | Completed | Notes |
| ----------------------------------------- | --------- | ----- |
| Legal hold issued (if applicable)         | ☐         |       |
| PIIA/NDA obligations confirmed            | ☐         |       |
| IP assignment acknowledged                | ☐         |       |
| Ongoing confidentiality obligations noted | ☐         |       |

---

## Sign-Off

| Role             | Name | Signature | Date |
| ---------------- | ---- | --------- | ---- |
| Departing member |      |           |      |
| Engineering Lead |      |           |      |
| Security Lead    |      |           |      |

---

_Filed in: `docs/exit-checklists/YYYY-MM-DD-<name>.md`_
