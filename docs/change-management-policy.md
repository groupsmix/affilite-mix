# Change Management Policy

> **Audit ref:** A66-F3 (SOC 2 CC8), A67-F7 (ISO 27001 A.8.32)
> **Owner:** Engineering
> **Last updated:** 2026-05-03

---

## Purpose

This policy defines the change management process for code, infrastructure, and configuration changes to ensure changes are reviewed, tested, and deployed safely.

## Scope

All changes to:
- Application code (Next.js, Workers)
- Infrastructure as Code (Terraform, wrangler.toml)
- Database migrations (Supabase)
- CI/CD pipelines (GitHub Actions)
- Environment variables and secrets
- DNS and CDN configuration

## Standard Change Process

### 1. Proposal

- Create a feature branch from `main`
- Changes must be scoped and described in the PR description
- Link to relevant issue/ticket if applicable

### 2. Review

- All PRs require **2 approving reviews** (enforced by branch protection)
- CODEOWNERS file designates required reviewers per path
- CI must pass: lint, type-check, unit tests, security scans (CodeQL, Semgrep, gitleaks)
- SBOM attestation and dependency review must pass

### 3. Testing

- Unit tests (Vitest) must pass
- E2E tests (Playwright) must pass for UI changes
- Integration tests must pass (when not skipped)
- Manual QA for user-facing changes

### 4. Deployment

- Merge to `main` triggers automatic deployment via OpenNext/Cloudflare Workers
- Auto-rollback on elevated error rates (Sentry alerts)
- Deployment is progressive (Cloudflare gradual rollout when available)

### 5. Post-Deployment

- Monitor Sentry error rates for 30 minutes post-deploy
- Verify health check endpoint returns 200
- Check SLO burn-rate alerts for anomalies

## Emergency Change Process (P1 Hotfix)

For production incidents requiring immediate remediation:

### Criteria

- Active P1/P0 incident with user impact
- Security vulnerability with active exploitation
- Data integrity issue requiring immediate fix

### Process

1. **Declare emergency:** Notify #engineering channel with incident link
2. **Branch:** Create `hotfix/<description>` branch from `main`
3. **Reduced review:** Single reviewer approval sufficient (must be a CODEOWNER)
4. **Testing:** At minimum, affected unit tests must pass. Full CI encouraged but not blocking
5. **Deploy:** Merge and deploy immediately
6. **Post-mortem:** Within 48 hours, file a post-mortem using `docs/templates/postmortem.md`
7. **Retroactive review:** Second reviewer must approve within 24 hours of merge
8. **Audit entry:** Record the emergency change in `docs/security-incidents.md`

### Restrictions

- Emergency changes must be scoped to the minimum fix
- No feature work may ride along with an emergency change
- All emergency changes are reviewed in the next weekly engineering sync

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-05-03 | Initial policy created (A66-F3, A67-F7) | Audit automation |
