# Rollback Strategy

This document describes how to identify a bad deployment and roll back to a known-good state.

## Identifying a Bad Deployment

### Automated Signals

1. **Sentry alerts** — Error rate spike after deployment indicates a regression.
2. **Cloudflare Analytics** — Check `Workers → affilite-mix → Analytics` for:
   - Spike in error responses (4xx/5xx)
   - Drop in successful requests
   - Increased CPU time (possible infinite loops or performance regressions)
3. **Uptime monitoring** — If configured, alerts from your uptime monitor (e.g. Better Stack, UptimeRobot) for any of:
   - `wristnerd.xyz`
   - `arabictools.wristnerd.site`
   - `crypto.wristnerd.site`

### Manual Verification

After each deployment, verify:

1. **Homepage loads** — Visit each domain and confirm content renders.
2. **Admin panel** — Log in at `/admin/login` and verify the dashboard loads.
3. **API health** — Confirm at least one API route responds (e.g. `GET /api/cron/publish` should return 401 without auth).

## Rollback via Cloudflare Dashboard

Cloudflare Workers keeps previous deployment versions. To roll back:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **affilite-mix**.
2. Click the **Deployments** tab.
3. Find the last known-good deployment (check the timestamp against when issues started).
4. Click the **three-dot menu (⋯)** on that deployment → **Rollback to this deployment**.
5. Confirm the rollback.
6. Verify all domains are serving correctly.

> **Note:** Rollback is near-instant since Cloudflare keeps the compiled Worker bundle for each deployment.

## Rollback via Wrangler CLI

If you have Wrangler configured locally:

```bash
# List recent deployments
wrangler deployments list

# Roll back to a specific deployment
wrangler rollback [deployment-id]
```

## Rollback via Git Revert

If the issue is in the application code (not infrastructure):

```bash
# Identify the bad commit
git log --oneline -10

# Revert the bad merge commit
git revert -m 1 <bad-merge-commit-sha>

# Push to main to trigger a new deployment
git push origin main
```

This triggers the normal CI/CD pipeline, which will build and deploy the reverted code.

## Database Rollback Considerations

Code rollbacks do **not** revert database changes. If a deployment included schema migrations:

1. Check if the old code is compatible with the new schema (it usually is if migrations are additive).
2. If not, you may need to manually revert the migration in Supabase SQL Editor.
3. **Always make migrations backward-compatible** — add new columns as nullable, don't rename or drop columns in the same release as code changes.

## Post-Rollback Checklist

After rolling back:

- [ ] Verify all three domains are serving correctly
- [ ] Check Sentry for new errors (the rollback itself should not cause errors)
- [ ] Notify the team about the rollback and the reason
- [ ] Create a post-mortem document describing what went wrong
- [ ] Fix the issue in a new branch, test thoroughly, then redeploy

## Prevention: Pre-Deployment Checks

To reduce the need for rollbacks:

1. **CI must pass** — Never merge to `main` if CI is red.
2. **Preview deployments** — Use Cloudflare Pages preview deployments for PRs when possible.
3. **Gradual rollout** — For high-risk changes, consider using Cloudflare's [Gradual Deployments](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/gradual-deployments/) to route a percentage of traffic to the new version first.
