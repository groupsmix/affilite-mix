# Access Recertification Policy & Log

## Overview

This document is the formal record for our quarterly access recertification process. To maintain a secure environment and adhere to compliance standards (e.g. SOC 2), we require a documented quarterly review of **every** principal that can reach production data, funds, or error telemetry.

## Policy

- **Frequency**: Access reviews must be conducted at least once per calendar quarter.
- **Principle of Least Privilege**: Access should only be granted to individuals whose current role explicitly requires it.
- **Offboarding**: Access for terminated or transferred employees must be revoked immediately upon departure; this quarterly review serves as a secondary catch-all audit.
- **Evidence**: Each review must produce (a) a dated entry in the log below, and (b) links to the exported rosters (stored in the team's evidence vault).

## Systems In Scope

| System                    | Roles Reviewed                                                     | Where To Export Roster                                        | Owner            |
| :------------------------ | :----------------------------------------------------------------- | :------------------------------------------------------------ | :--------------- |
| **GitHub**                | Org Owner, Repo Admin, Actions secret admins                       | Org → People (filter `role:owner`) + repo `Settings → Access` | Engineering Lead |
| **Cloudflare**            | Super Admin, Administrator, Workers deployer, API token owners     | Account → Members + `My Profile → API Tokens`                 | Platform         |
| **Supabase**              | Org Owner, Project Admin, SQL editor access                        | Org Settings → Team + Project → Settings → Team               | Platform         |
| **Sentry**                | Org Owner, Manager, Billing, Integration/auth-token owners         | Settings → Members + Settings → Auth Tokens                   | Engineering Lead |
| **Stripe**                | Administrator, Developer (API keys), Connect account owners        | Settings → Team + Developers → API keys                       | Finance + Eng    |
| **Admin Dashboard (app)** | All `super_admin` records in `admin_users`; admin-site memberships | Run the SQL query in the "Admin dashboard" section below      | Engineering Lead |

## Procedure

1. **Export Rosters**: For each system above, export or screenshot the current membership + role list. Attach all exports to the evidence folder for the quarter.
2. **Admin Dashboard Query**: For the application's own `super_admin` and per-site admin memberships, run:

   ```sql
   -- super_admins (highest in-app privilege)
   select id, email, role, disabled, last_login_at
   from admin_users
   where role = 'super_admin' and disabled = false;

   -- per-site admin memberships
   select asm.admin_user_id, au.email, asm.site_id, asm.role, asm.created_at
   from admin_site_memberships asm
   join admin_users au on au.id = asm.admin_user_id
   where au.disabled = false
   order by asm.site_id, au.email;
   ```

   Save the output (CSV) to the evidence folder.

3. **Review Access**: Compare every list against the current active employee roster and their job responsibilities. Flag:
   - accounts belonging to people who left or changed roles
   - tokens/API keys that have no clear owner
   - `super_admin` roles that could be downgraded to `admin`
   - Stripe keys older than 90 days (cross-ref `secrets-rotation-runbook.md`)
   - Sentry auth tokens older than 180 days
4. **Revoke / Downgrade**: Remove or reduce access for anyone flagged. For the admin dashboard, this means toggling `disabled = true` in `admin_users` or deleting the row in `admin_site_memberships`.
5. **Document**: Record the audit in the **Recertification Log** below. Include (a) who reviewed, (b) which systems were covered, (c) exactly what changed, (d) links to evidence artefacts.
6. **Follow-up**: File issues for any policy gaps discovered (e.g. missing SSO enforcement, shared accounts).

## Recertification Schedule

Reviews are due the first full week of Jan / Apr / Jul / Oct. A calendar invite owned by the Engineering Lead tracks each due date.

---

## Recertification Log

Please add a new row to this table each time a quarterly review is completed.

| Date       | Reviewer                         | Systems Reviewed                                                              | Findings & Actions Taken                                                                                                                                                                                              | Evidence Link                                    | Next Review Due |
| :--------- | :------------------------------- | :---------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------- | :-------------- |
| 2026-05-29 | Security Lead (initial baseline) | GitHub, Cloudflare, Supabase, Sentry, Stripe, Admin Dashboard                 | Initial recertification cycle established (A183). All systems inventoried; rosters exported. No departures pending. CODEOWNERS teams verified ≥ 2 members each. Action: schedule recurring quarterly calendar invite. | Roster exports saved to evidence vault (2026-Q2) | 2026-07-07      |
| YYYY-MM-DD | [Reviewer Name]                  | GitHub, Cloudflare, Supabase, Sentry, Stripe, Admin dashboard (`super_admin`) | _Example: Reviewed all admins. Removed [User] from GitHub as they transitioned to a non-technical role. Disabled 1 stale `super_admin` in admin_users._                                                               | _link to vault_                                  | YYYY-MM-DD      |
|            |                                  |                                                                               |                                                                                                                                                                                                                       |                                                  |                 |
|            |                                  |                                                                               |                                                                                                                                                                                                                       |                                                  |                 |
|            |                                  |                                                                               |                                                                                                                                                                                                                       |                                                  |                 |
