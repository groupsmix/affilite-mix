# AUD-06 — RBAC Metadata Anon-Read Verification

**Date:** 2026-05-28
**Auditor:** Devin (Builder Agent)
**Commit:** main HEAD at time of audit
**Scope:** Determine whether `roles`, `permissions`, `role_permissions`,
`integration_providers`, `site_modules`, and `site_feature_flags` need
`anon` SELECT policies.

---

## Method

1. `rg "from\(['\"](<table>)['\"])"` across `app/`, `lib/`, `config/`, `scripts/`, `workers/`.
2. For each call site: identify the route, the auth guard, and the Supabase client type.
3. Cross-reference with `app/(public)/` to check for unauthenticated rendering paths.

---

## Results

### Tables with application-code references

| file:line                    | route                     | route_kind             | client_kind                   | table                   | data_returned             |
| ---------------------------- | ------------------------- | ---------------------- | ----------------------------- | ----------------------- | ------------------------- |
| `lib/dal/permissions.ts:39`  | `/api/admin/permissions`  | admin (`requireAdmin`) | authenticated (admin session) | `roles`                 | role list                 |
| `lib/dal/permissions.ts:53`  | `/api/admin/permissions`  | admin (`requireAdmin`) | authenticated (admin session) | `roles`                 | single role by name       |
| `lib/dal/permissions.ts:69`  | `/api/admin/permissions`  | admin (`requireAdmin`) | authenticated (admin session) | `permissions`           | permission list           |
| `lib/dal/permissions.ts:84`  | `/api/admin/permissions`  | admin (`requireAdmin`) | authenticated (admin session) | `role_permissions`      | permission IDs for a role |
| `lib/dal/permissions.ts:93`  | `/api/admin/permissions`  | admin (`requireAdmin`) | authenticated (admin session) | `permissions`           | permissions by ID list    |
| `lib/dal/permissions.ts:241` | `/api/admin/permissions`  | admin (`requireAdmin`) | authenticated (admin session) | `permissions`           | permission check          |
| `lib/dal/integrations.ts:27` | `/api/admin/integrations` | admin (`withAuthz`)    | authenticated (admin session) | `integration_providers` | provider list             |
| `lib/dal/integrations.ts:42` | `/api/admin/integrations` | admin (`withAuthz`)    | authenticated (admin session) | `integration_providers` | providers by category     |
| `lib/dal/integrations.ts:58` | `/api/admin/integrations` | admin (`withAuthz`)    | authenticated (admin session) | `integration_providers` | single provider by key    |

### Tables with NO application-code references from public routes

| table                   | referenced in app code                             | called from public route | anon SELECT needed      |
| ----------------------- | -------------------------------------------------- | ------------------------ | ----------------------- |
| `roles`                 | Yes (`lib/dal/permissions.ts`)                     | **No** — admin only      | **No**                  |
| `permissions`           | Yes (`lib/dal/permissions.ts`)                     | **No** — admin only      | **No**                  |
| `role_permissions`      | Yes (`lib/dal/permissions.ts`)                     | **No** — admin only      | **No**                  |
| `integration_providers` | Yes (`lib/dal/integrations.ts`)                    | **No** — admin only      | **No**                  |
| `site_modules`          | Yes (`lib/dal/modules.ts`, `lib/authz.ts` mapping) | **No** — admin only      | **Possibly** (see note) |
| `site_feature_flags`    | Yes (`lib/dal/feature-flags.ts`)                   | **No** — admin only      | **Possibly** (see note) |

### Notes on `site_modules` and `site_feature_flags`

The migration `00028_platform_modules_permissions_integrations.sql` created
`site_modules_public_read` and `site_feature_flags_public_read` policies with
`USING (true)`. The original design intent appears to be that the public
marketing site could render "features available" lists. However, **no public
route currently queries these tables**. Both DAL files (`lib/dal/modules.ts`,
`lib/dal/feature-flags.ts`) are imported only from admin routes.

If a future public route needs per-site module/flag data (e.g. to show
"this site supports X"), the policy could be scoped to
`TO authenticated USING (site_id = current_setting('app.site_id'))` or
kept as `USING (true)` with a documented justification. For now, the
public-read policy is unnecessary.

---

## Conclusion

**All four platform-global tables (`roles`, `permissions`, `role_permissions`,
`integration_providers`) do NOT need anon SELECT.** They are only queried
from admin-guarded routes using authenticated sessions. The current
`USING (true)` policies expose the full RBAC schema to unauthenticated
clients holding the anon key — unnecessary attack surface.

**`site_modules` and `site_feature_flags`** also have no current public
consumers, but the design intent is plausibly public-facing. Recommend
keeping but scoping to site-level if needed later.

---

## Recommended follow-up (TASK-004b)

Create a new migration that replaces:

- `roles_public_read` → `TO authenticated` (or drop entirely)
- `permissions_public_read` → `TO authenticated` (or drop entirely)
- `role_permissions_public_read` → `TO authenticated` (or drop entirely)
- `integration_providers_public_read` → `TO authenticated` (or drop entirely)

**Owner approval required** — this is an RLS change.
