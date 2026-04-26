# Admin Audit-Log Review & Alerting Runbook

This runbook defines (1) which admin actions we record in `audit_log`, (2) which of those actions trigger real-time alerts, and (3) the weekly/monthly review cadence that keeps the backlog under control.

Cross-references:

- DAL: `lib/audit-log.ts` (`recordAuditEvent(event: AuditEvent)`)
- Table: `audit_log` (Supabase) with columns `site_id, actor, actor_user_id, action, entity_type, entity_id, details, ip, created_at`
- Related docs: `docs/alerting-runbook.md`, `docs/access-recertification.md`, `docs/secrets-rotation-runbook.md`, `docs/incident-response.md`

---

## 1. High-Signal Events

Every admin mutation must call `recordAuditEvent(...)`. The events below are the **highest-signal** — they either indicate a privilege change, a destructive action, or a potential abuse pattern. Each row lists its `action`/`entity_type` pair and the alerting policy.

| #   | What happened                           | `action`                      | `entity_type`                     | Alert severity      | Destination                       |
| --- | --------------------------------------- | ----------------------------- | --------------------------------- | ------------------- | --------------------------------- |
| 1   | `super_admin` created                   | `create`                      | `admin_user` (role=`super_admin`) | **P1 — page**       | Sentry + `#incidents` + PagerDuty |
| 2   | Admin role changed (including demotion) | `assign_role` / `remove_role` | `admin_user`                      | **P2 — alert**      | Sentry + `#incidents`             |
| 3   | Tenant/site membership changed          | `create` / `delete`           | `user_site_role`                  | **P2 — alert**      | Sentry + `#incidents`             |
| 4   | Product deleted                         | `delete`                      | `product`                         | **P3 — log-review** | Slack `#alerts` (digest)          |
| 5   | Content deleted                         | `delete`                      | `content` / `page`                | **P3 — log-review** | Slack `#alerts` (digest)          |
| 6   | Cron manually triggered                 | `manual_trigger`              | `scheduled_job`                   | **P3 — log-review** | Slack `#alerts`                   |
| 7   | Service-role data export                | `gdpr_export`                 | any                               | **P2 — alert**      | Sentry + `#incidents`             |
| 8   | High volume of password-reset requests  | `request_password_reset`      | `admin_user`                      | **P1 — page**       | Sentry + `#incidents` + PagerDuty |

> "Page" means on-call is paged (24/7). "Alert" means a non-paging notification to the incidents channel. "Log-review" means it only surfaces in the weekly digest unless the review below catches abuse.

---

## 2. Detection Queries

These queries should be turned into Sentry "Metric Alerts" (via the Supabase Sentry integration or a Cloudflare Tail Worker that emits Sentry events) **or** scheduled via `supabase/migrations/*_audit_alerts.sql` as `pg_cron` + Webhook policies.

### 2.1 super_admin created

```sql
select id, site_id, actor, actor_user_id, entity_id, details, created_at
from audit_log
where action = 'create'
  and entity_type = 'admin_user'
  and (details ->> 'role') = 'super_admin'
  and created_at >= now() - interval '5 minutes';
```

Alert: **any match** → P1.

### 2.2 Admin role changed

```sql
select *
from audit_log
where action in ('assign_role', 'remove_role')
  and entity_type = 'admin_user'
  and created_at >= now() - interval '5 minutes';
```

Alert: **any match** → P2.

### 2.3 Tenant/site membership changed

```sql
select *
from audit_log
where entity_type = 'user_site_role'
  and action in ('create', 'delete', 'update')
  and created_at >= now() - interval '15 minutes';
```

Alert: **more than 5 events in 15 minutes from the same `actor`** → P2. Single events land in the weekly digest.

### 2.4 Product / content deleted

```sql
select actor, count(*) as deletes
from audit_log
where action = 'delete'
  and entity_type in ('product', 'content', 'page')
  and created_at >= now() - interval '1 hour'
group by actor
having count(*) >= 10;
```

Alert: **≥ 10 deletions in 1 hour from the same actor** → P2.

### 2.5 Cron manually triggered

```sql
select *
from audit_log
where action = 'manual_trigger'
  and entity_type = 'scheduled_job'
  and created_at >= now() - interval '24 hours';
```

Alert: **> 3 manual triggers in 24 hours** → P3. **Any manual trigger of `stripe-sync` or `data-retention`** → P2.

### 2.6 Service-role data export (GDPR export)

```sql
select *
from audit_log
where action = 'gdpr_export'
  and created_at >= now() - interval '5 minutes';
```

Alert: **any match** → P2 (every export must have an approved ticket ID in `details.ticket_id`).

### 2.7 High volume of password-reset requests

```sql
select count(*) as resets_last_hour
from audit_log
where action = 'request_password_reset'
  and created_at >= now() - interval '1 hour';
```

Alert: **> 20 resets in 1 hour** → P1 (suggests credential-stuffing / account-takeover attempt).

---

## 3. Review Cadence

### Weekly

- **Owner**: on-call engineer for the week.
- **When**: Every Monday, 10:00 local time.
- **Duration budget**: 30 min.
- **Inputs**:
  1. Saved Supabase query `audit_log_weekly_digest` (last 7 days grouped by `action, entity_type`).
  2. The auto-generated Slack digest posted to `#alerts`.
- **Checklist**:
  - [ ] Spot-check 5 random `delete` events; confirm intent matches the ticket that triggered them.
  - [ ] Verify every `assign_role` / `remove_role` corresponds to an HR ticket or recertification action.
  - [ ] Confirm all `manual_trigger` events have a linked incident or investigation note.
  - [ ] Triage any P3 alerts that fired without a corresponding incident.

### Monthly

- **Owner**: Engineering Lead.
- **When**: First business day of the month.
- **Inputs**: The full month's `audit_log` export (CSV from Supabase).
- **Checklist**:
  - [ ] Trend: count of `super_admin` changes — must be ≤ 2 unless explained.
  - [ ] Distribution of `gdpr_export` actors — are the same two engineers doing all exports? If not, investigate.
  - [ ] Error budget on audit-log write failures (`audit_log_failure` analytics counter in `lib/audit-log.ts`) — if > 0.1 % of writes fail, open a platform ticket.
  - [ ] Confirm retention policy: rows older than 400 days should be archived to R2 via `/api/cron/data-retention`.

### Quarterly

- Bundle the previous three months of findings into the evidence pack for `docs/access-recertification.md`.

---

## 4. Alert Implementation

There are three interchangeable delivery paths; we use them all in production:

1. **Sentry Metric Alerts** — most queries above are published as custom events from a scheduled Supabase → Cloudflare Tail Worker → Sentry pipeline. Sentry handles paging via its PagerDuty integration.
2. **Supabase `pg_cron` + Supabase Webhook** — runs the query every 5 min, posts a JSON payload to a Cloudflare Worker endpoint (`/api/internal/audit-alert`), which forwards to Slack.
3. **Cloudflare Logpush → Splunk/S3** — for long-term retention and ad-hoc hunt queries.

When adding a **new** high-signal action:

1. Add/extend the call to `recordAuditEvent(...)` in the admin handler.
2. Add a row to the table in §1 of this doc.
3. If it requires an alert, add a detection query in §2 and an entry in the Sentry alert-rules directory (`terraform/sentry/alerts.tf`).
4. Add (or update) a test in `__tests__/audit-log-coverage.test.ts` asserting the action is recorded.

---

## 5. What NOT To Alert On

To keep signal-to-noise high, the following are intentionally **not** paged:

- Individual product / content creates and updates (we rely on approvals + weekly review).
- Routine `edit` / `reorder` actions.
- Image uploads (visible via Cloudflare Logpush + storage metrics).

These still land in `audit_log` and are reviewable via the weekly digest; they simply don't wake anyone up.
