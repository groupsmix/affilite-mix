# Supply Chain Risk Register

> **Audit ref:** A84-F2 (ISO 27001 A.5.21)
> **Owner:** Security
> **Review cadence:** Quarterly
> **Last reviewed:** 2026-05-03

---

## Purpose

This register tracks supply-chain risks beyond what Dependabot and automated scanning cover. It documents known risks in the software supply chain and the mitigations in place.

## Automated Controls

| Control | Tool | CI integration | Evidence |
|---------|------|----------------|----------|
| Dependency vulnerability scanning | Dependabot | Auto-PRs on new CVEs | `.github/dependabot.yml` |
| Static analysis (security) | CodeQL | Required CI check | `.github/workflows/codeql.yml` |
| Static analysis (custom rules) | Semgrep | Required CI check | `.github/workflows/semgrep.yml`, `.semgrep/` |
| Secret scanning | Gitleaks | Required CI check | `.gitleaks.toml` |
| Dependency review (new deps) | GitHub dep-review | Required CI check | `.github/workflows/ci.yml` |
| SBOM generation | cosign/syft | CI pipeline | `docs/sbom-retention.md` |
| License compliance | SBOM analysis | Manual review | `docs/ATTRIBUTIONS.md` |

## Risk Register

| # | Risk | Likelihood | Impact | Mitigation | Residual risk | Owner |
|---|------|-----------|--------|------------|---------------|-------|
| 1 | Compromised npm package in dependency tree | Medium | High | Dependabot, lockfile pinning, dep-review action, SBOM | Low | Engineering |
| 2 | Malicious GitHub Action in CI pipeline | Low | Critical | Pin actions to SHA, review action updates, minimal permissions | Low | Engineering |
| 3 | Typosquatting attack on npm install | Low | High | Lockfile committed, `npm ci` in CI (not `npm install`) | Low | Engineering |
| 4 | Upstream provider SDK vulnerability | Medium | Medium | Dependabot auto-PRs, quarterly manual review | Low | Engineering |
| 5 | Build-time supply chain injection | Low | Critical | SBOM attestation with cosign, reproducible builds | Low | Engineering |
| 6 | Compromised Cloudflare Worker runtime | Very Low | Critical | Cloudflare's own security program (SOC 2, ISO 27001) | Accepted | SRE |
| 7 | Supabase platform compromise | Very Low | Critical | EU-pinned region, encryption at rest, DPA in place | Accepted | SRE |

## Review Process

1. Quarterly: Review Dependabot alert history and resolution times
2. Quarterly: Audit GitHub Actions for version drift from pinned SHAs
3. Quarterly: Review any new direct dependencies added in the quarter
4. Annually: Full SBOM review and license audit
5. On incident: Update this register with new risks identified

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-05-03 | Initial register created (A84-F2) | Audit automation |
