# Admin Route Authorization Matrix (A-01)

This document is the single source of truth for which authorization pattern
each admin API route uses. Every admin mutation route MUST use `withAuthz()`
or `withAuthzDynamic()`. Routes that legitimately use `requireAdmin()` only
(e.g. bootstrap operations, the permission system itself) are documented
with an explicit justification.

The CI script `scripts/check-admin-authz.sh` asserts that no admin mutation
handler exports a handler without `withAuthz` unless it appears in the
`EXEMPTIONS` list below.

## Authorization Patterns

| Pattern                                      | Description                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------ |
| `withAuthz(feature, action, handler)`        | Fine-grained RBAC via `hasPermission()` against the server-derived active site |
| `withAuthzDynamic(feature, action, handler)` | Same as above for dynamic `[param]` routes; also calls `authorizeResource()`   |
| `requireAdmin()`                             | Session + rate-limit + site-resolution only (no fine-grained permission check) |

## Route Matrix

### Routes using `withAuthz` / `withAuthzDynamic` (fully RBAC-gated)

| Route                           | Method | Feature       | Action | Pattern          |
| ------------------------------- | ------ | ------------- | ------ | ---------------- |
| `/api/admin/ads`                | GET    | ads           | read   | withAuthz        |
| `/api/admin/ads`                | POST   | ads           | create | withAuthz        |
| `/api/admin/ads/[id]`           | PUT    | ads           | edit   | withAuthzDynamic |
| `/api/admin/ads/[id]`           | DELETE | ads           | delete | withAuthzDynamic |
| `/api/admin/affiliate-networks` | GET    | integrations  | view   | withAuthz        |
| `/api/admin/affiliate-networks` | POST   | integrations  | create | withAuthz        |
| `/api/admin/affiliate-networks` | DELETE | integrations  | delete | withAuthz        |
| `/api/admin/ai-content`         | GET    | content       | view   | withAuthz        |
| `/api/admin/ai-content`         | POST   | content       | create | withAuthz        |
| `/api/admin/ai-content`         | PATCH  | content       | edit   | withAuthz        |
| `/api/admin/ai-content`         | DELETE | content       | delete | withAuthz        |
| `/api/admin/analytics`          | GET    | analytics     | view   | withAuthz        |
| `/api/admin/categories`         | GET    | categories    | view   | withAuthz        |
| `/api/admin/categories`         | POST   | categories    | create | withAuthz        |
| `/api/admin/categories`         | PATCH  | categories    | edit   | withAuthz        |
| `/api/admin/categories`         | DELETE | categories    | delete | withAuthz        |
| `/api/admin/categories/usage`   | GET    | categories    | view   | withAuthz        |
| `/api/admin/content`            | GET    | content       | view   | withAuthz        |
| `/api/admin/content`            | POST   | content       | create | withAuthz        |
| `/api/admin/content`            | PATCH  | content       | edit   | withAuthz        |
| `/api/admin/content`            | DELETE | content       | delete | withAuthz        |
| `/api/admin/content/clone`      | POST   | content       | create | withAuthz        |
| `/api/admin/content/share`      | GET    | content       | view   | withAuthz        |
| `/api/admin/content/share`      | POST   | content       | create | withAuthz        |
| `/api/admin/content/share`      | DELETE | content       | delete | withAuthz        |
| `/api/admin/content-products`   | PUT    | content       | edit   | withAuthz        |
| `/api/admin/feature-flags`      | GET    | feature-flags | read   | withAuthz        |
| `/api/admin/feature-flags`      | POST   | feature-flags | create | withAuthz        |
| `/api/admin/feature-flags`      | PATCH  | feature-flags | edit   | withAuthz        |
| `/api/admin/feature-flags`      | DELETE | feature-flags | delete | withAuthz        |
| `/api/admin/integrations`       | GET    | integrations  | view   | withAuthz        |
| `/api/admin/integrations`       | POST   | integrations  | create | withAuthz        |
| `/api/admin/integrations`       | DELETE | integrations  | delete | withAuthz        |
| `/api/admin/modules`            | GET    | modules       | read   | withAuthz        |
| `/api/admin/modules`            | POST   | modules       | create | withAuthz        |
| `/api/admin/modules`            | DELETE | modules       | delete | withAuthz        |
| `/api/admin/pages`              | GET    | pages         | view   | withAuthz        |
| `/api/admin/pages`              | POST   | pages         | create | withAuthz        |
| `/api/admin/pages/[id]`         | PATCH  | pages         | edit   | withAuthzDynamic |
| `/api/admin/pages/[id]`         | DELETE | pages         | delete | withAuthzDynamic |
| `/api/admin/pages/reorder`      | POST   | pages         | edit   | withAuthz        |
| `/api/admin/preview-token`      | POST   | content       | view   | withAuthz        |
| `/api/admin/products`           | GET    | products      | view   | withAuthz        |
| `/api/admin/products`           | POST   | products      | create | withAuthz        |
| `/api/admin/products`           | PATCH  | products      | edit   | withAuthz        |
| `/api/admin/products`           | DELETE | products      | delete | withAuthz        |
| `/api/admin/products/export`    | GET    | products      | view   | withAuthz        |
| `/api/admin/products/import`    | POST   | products      | create | withAuthz        |
| `/api/admin/schedule`           | GET    | content       | view   | withAuthz        |
| `/api/admin/schedule`           | POST   | content       | create | withAuthz        |
| `/api/admin/upload`             | POST   | upload        | create | withAuthz        |
| `/api/admin/upload/finalize`    | POST   | upload        | create | withAuthz        |
| `/api/admin/privacy/user`       | GET    | privacy       | view   | withAuthz        |
| `/api/admin/privacy/user`       | DELETE | privacy       | delete | withAuthz        |
| `/api/admin/users`              | GET    | users         | view   | withAuthz        |

### Routes using `requireAdmin()` only (with justification)

| Route                          | Method          | Justification                                                                                                                      |
| ------------------------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `/api/admin/permissions`       | GET             | Manages the permission system itself; requires `super_admin` role via `assertRole()`. Circular dependency if gated by `withAuthz`. |
| `/api/admin/permissions`       | POST            | Same as above.                                                                                                                     |
| `/api/admin/permissions`       | DELETE          | Same as above.                                                                                                                     |
| `/api/admin/sites`             | GET             | Site listing for the admin UI; requires `super_admin` via `assertRole()`.                                                          |
| `/api/admin/sites`             | POST            | Site creation; requires `super_admin` via `assertRole()`.                                                                          |
| `/api/admin/sites`             | PUT             | Site update; requires `super_admin` via `assertRole()`.                                                                            |
| `/api/admin/sites`             | DELETE          | Site deletion; requires `super_admin` via `assertRole()`.                                                                          |
| `/api/admin/sites/[id]`        | GET             | Site detail; requires `super_admin` via `assertRole()`.                                                                            |
| `/api/admin/sites/[id]`        | PATCH           | Site update; requires `super_admin` via `assertRole()`.                                                                            |
| `/api/admin/sites/[id]`        | DELETE          | Site deletion; requires `super_admin` via `assertRole()`.                                                                          |
| `/api/admin/sites/active`      | GET             | Returns the currently active site for the session. Read-only, no mutation.                                                         |
| `/api/admin/sites/select`      | POST            | Sets which site the admin is working on. Meta-operation, not a data mutation.                                                      |
| `/api/admin/sites/stats`       | GET             | Read-only site statistics.                                                                                                         |
| `/api/admin/sites/templates`   | GET             | Read-only template listing.                                                                                                        |
| `/api/admin/users/me`          | GET             | Current user profile. Read-only self-access.                                                                                       |
| `/api/admin/users/me/password` | PUT             | Password change. Self-only operation; requires current password.                                                                   |
| `/api/admin/users/me/totp`     | POST/PUT/DELETE | TOTP enrollment/verification. Self-only operation.                                                                                 |

## CI Enforcement

The `scripts/check-admin-authz.sh` script:

1. Scans all `app/api/admin/**/route.ts` files
2. For each exported mutation handler (POST, PUT, PATCH, DELETE)
3. Asserts it uses `withAuthz` or `withAuthzDynamic`
4. Unless the route is in the documented exemption list above
5. Fails CI if any unexempted route uses only `requireAdmin()`
