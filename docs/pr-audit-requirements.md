# PR Audit Requirements (F-30)

Every pull request that touches security-critical paths must include the following
in its description or an attached audit document:

## Required PR Artifacts

1. **Diff summary**: One-line description of what changed and why.
2. **Test output**: Pass/fail screenshot or CI link for unit + integration tests.
3. **Migration plan**: For DB changes — up/down scripts, rollback steps, data backfill strategy.
4. **Rollback plan**: How to revert if the change causes production issues.
5. **Observability notes**: New metrics, log lines, or alerts introduced.
6. **Security impact**: Which CWE/OWASP categories are addressed or introduced.

## Security-Critical Paths

The following directories/files require full audit artifacts:

- `lib/auth.ts`, `lib/authz.ts`
- `lib/rate-limit.ts`
- `lib/stripe-*`, `app/api/membership/**`
- `lib/ai/**`
- `lib/ssrf-guard.ts`, `lib/sanitize-html.ts`
- `lib/quotas.ts`, `lib/r2.ts`
- `app/api/revalidate/**`, `app/api/internal/**`
- `middleware.ts`, `lib/csrf.ts`
- Any Terraform/infrastructure changes

## CI Enforcement

The `check` workflow validates:

- Branch protection rules are active (attach evidence per F-16)
- SBOM is generated and uploaded (F-17)
- Coverage thresholds per critical path (F-01)
- No unlinked TODO/FIXME markers (F-06)

## Audit Evidence Bundle

Per-release, maintain in `docs/audit-evidence/`:

- Exported branch protection screenshots
- SBOM artifact from the release build
- Restore test reports with RTO/RPO results
- Access review logs
- Incident drill outcomes
