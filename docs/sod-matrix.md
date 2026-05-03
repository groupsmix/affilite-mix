# Separation of Duties Matrix (OF-28)

> Last updated: 2026-05-03. Owner: Security.

## RBAC Roles

Roles are defined in [`config/rbac/roles.json`](../config/rbac/roles.json) and
enforced at runtime by `lib/admin-guard.ts`. The CI gate
[`tools/sod-check.ts`](../tools/sod-check.ts) validates that no role violates
the forbidden-pair constraints below.

| Role              | Permissions (allow)                                               | Inherits from                              |
| ----------------- | ----------------------------------------------------------------- | ------------------------------------------ |
| viewer            | sites.read, analytics.read                                       | --                                         |
| editor            | sites.read/write, quiz.read/write, newsletter.read/write         | viewer                                     |
| billing_admin     | memberships.read/write, invoices.read                             | viewer                                     |
| privacy_officer   | privacy.read/write/delete, audit_log.read                        | viewer                                     |
| super_admin       | terraform.read, audit_log.read                                   | editor, billing_admin, privacy_officer     |

> `super_admin` intentionally has **no** `approve_deploy` or `approve_payout`
> to satisfy SoD requirements. Deployments must be approved by a second human
> via GitHub PR review.

## Forbidden Pairs (SoD Constraints)

| Write action     | Approval action | Rationale                                               |
| ---------------- | --------------- | ------------------------------------------------------- |
| approve_deploy   | write           | No role may both initiate and approve a deployment.     |
| approve_payout   | write           | No role may both initiate and approve a payout.         |

## CI Enforcement

```bash
# Run locally
pnpm exec tsx tools/sod-check.ts

# Check a single role
pnpm exec tsx tools/sod-check.ts --role super_admin
```

The check is wired into CI via `.github/workflows/ci.yml`. It reads
`config/rbac/roles.json`, resolves inheritance chains, and exits non-zero if
any role holds both sides of a forbidden pair.
