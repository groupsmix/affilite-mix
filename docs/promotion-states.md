# Deployment Promotion & Rollback States

This document defines the codified deployment states and transitions for Affilite-Mix.

---

## State Machine

```
┌─────────┐    CI pass     ┌─────────┐   health-gate   ┌────────────┐
│  Build   │ ─────────────▶│ Preview  │ ──────────────▶ │ Production │
└─────────┘                └─────────┘                  └────────────┘
                               │                              │
                               │ PR closed                    │ incident
                               ▼                              ▼
                          ┌─────────┐                   ┌────────────┐
                          │ Cleaned │                   │  Rollback  │
                          └─────────┘                   └────────────┘
                                                              │
                                                              │ fix merged
                                                              ▼
                                                        ┌────────────┐
                                                        │ Production │
                                                        └────────────┘
```

## States

| State          | Description                                                                      | Entry Condition                                           |
| -------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Build**      | CI runs lint, typecheck, tests, security audit, and `next build`                 | Push to any branch or PR opened                           |
| **Preview**    | PR-scoped Cloudflare Worker (`affilite-mix-preview-pr-N`) using staging Supabase | PR opened + CI passes + staging secrets configured        |
| **Production** | Live Worker (`affilite-mix`) serving all custom domains                          | Push to `main` + build succeeds + health gate passes      |
| **Rollback**   | Previous known-good Worker deployment restored                                   | Manual trigger via `rollback.yml` or Cloudflare Dashboard |
| **Cleaned**    | Preview Worker deleted after PR is closed/merged                                 | PR closed (handled by preview cleanup)                    |

## Transitions

### Build → Preview (automatic)

- **Trigger:** PR opened/synchronized
- **Workflow:** `preview.yml`
- **Gate:** Staging Supabase secrets must be configured; build must succeed
- **Artifact:** Preview Worker deployed, URL posted as PR comment

### Preview → Production (merge to main)

- **Trigger:** PR merged to `main`
- **Workflow:** `deploy.yml`
- **Gates:**
  1. `npm install` succeeds
  2. Database migrations applied successfully
  3. R2 bucket and KV namespace exist (created if not)
  4. OpenNext build succeeds
  5. `wrangler deploy` succeeds
  6. Worker secrets set
  7. **Post-deploy health gate** — `/api/health` returns 200 with no degraded checks
  8. Site reachability verified

### Production → Rollback (manual)

- **Trigger:** Manual dispatch of `rollback.yml`
- **Options:**
  - `rollback-instant` — Revert to a previous Cloudflare Worker deployment via API
  - `rollback-git-revert` — Revert a specific commit on `main`, triggering a fresh deploy
- **Gate:** Post-rollback health check (skippable in emergencies)

### Staging → Production (manual promotion)

- **Trigger:** Manual dispatch of `rollback.yml` with `promote-staging` action
- **Gates:**
  1. Staging health check passes
  2. Production build succeeds
  3. Production deploy succeeds
  4. Post-promotion health gate passes

## Rollback Decision Matrix

| Signal                                 | Severity | Action                                 |
| -------------------------------------- | -------- | -------------------------------------- |
| `/api/health` returns 503              | Critical | Instant rollback                       |
| Sentry error rate > 10/min post-deploy | High     | Instant rollback                       |
| All domains return 5xx                 | Critical | Instant rollback                       |
| Single feature broken, core works      | Medium   | Git revert + redeploy                  |
| Performance degradation                | Low      | Investigate, then git revert if needed |

## GitHub Actions Workflows

| Workflow         | File            | Trigger                | Purpose                                          |
| ---------------- | --------------- | ---------------------- | ------------------------------------------------ |
| CI               | `ci.yml`        | Push/PR                | Lint, test, typecheck, build                     |
| Deploy           | `deploy.yml`    | Push to main           | Build + deploy + health gate                     |
| Preview          | `preview.yml`   | PR opened              | Deploy preview Worker                            |
| Rollback/Promote | `rollback.yml`  | Manual dispatch        | Instant rollback, git revert, or promote staging |
| Terraform        | `terraform.yml` | Changes to `infra/`    | Plan on PR, apply on merge                       |
| SBOM             | `sbom.yml`      | Push to main / release | Generate & sign SBOMs                            |
