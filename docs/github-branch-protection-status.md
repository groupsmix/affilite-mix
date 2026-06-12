# GitHub Branch Protection Status

> **Due Diligence Artifact**
> **Last Updated:** 2026-06-12
> **Purpose:** Document GitHub branch-protection state and required_review_count for due diligence

## Repository

| Property | Value |
| -------- | ----- |
| **Owner** | `groupsmix` |
| **Repository** | `affilite-mix` |
| **Default Branch** | `main` |

---

## Branch Protection Ruleset

| Property | Value | Source |
| -------- | ----- | ------ |
| **Ruleset Name** | `main-protection` | `terraform/github/branch-protection.tf` |
| **Target** | Branch (`refs/heads/main`) | `terraform/github/branch-protection.tf` |
| **Enforcement** | Active | `terraform/github/branch-protection.tf` |
| **Implementation** | Terraform IaC | `terraform/github/branch-protection.tf` |

---

## Required Controls (BP-1 through BP-8)

| # | Control | Status | Details |
| -- | ------- | ------ | ------- |
| BP-1 | CI is a required status check on PRs to `main` | ✅ Enforced | Required checks: `check`, `secret-scan`, `codeql`, `dependency-review`, `sbom`, `wrangler-dry-run`, `staging-smoke` |
| BP-2 | Security workflow is a required status check | ✅ Enforced | `secret-scan`, `codeql`, `dependency-review` are required |
| BP-3 | At least one approving review required | ✅ Enforced | **required_review_count = 2** (see below) |
| BP-4 | No direct push to `main` | ✅ Enforced | `update = false` in ruleset |
| BP-5 | No admin/maintainer bypass except break-glass | ✅ Enforced | Bypass actors disabled by default (`break_glass_team_slug = null`) |
| BP-6 | Signed commits required (provenance) | ✅ Enforced | `required_signatures = true` |
| BP-7 | No force-push, no branch deletion on `main` | ✅ Enforced | `non_fast_forward = true`, `deletion = true` |
| BP-8 | Linear history | ✅ Enforced | `required_linear_history = true` |

---

## PR Review Requirements

| Setting | Value | Source |
| ------- | ----- | ------ |
| **Required Approving Review Count** | **2** | `terraform/github/main.tf` (default = 2, validated >= 2) |
| **Dismiss Stale Reviews on Push** | Yes | `terraform/github/branch-protection.tf` |
| **Require Code Owner Review** | Yes | `terraform/github/branch-protection.tf` |
| **Require Last Push Approval** | Yes | `terraform/github/branch-protection.tf` |
| **Required Review Thread Resolution** | Yes | `terraform/github/branch-protection.tf` |

**Policy Rationale (A34):** Require 2 reviewers to prevent single-actor merges. The Terraform variable validates that `required_review_count >= 2`.

---

## Break-Glass Policy

| Setting | Value | Source |
| ------- | ----- | ------ |
| **Break-Glass Team Slug** | `null` (disabled) | `terraform/github/main.tf` (default = null) |
| **Bypass Mode** | `pull_request` (if enabled) | `terraform/github/branch-protection.tf` |
| **MFA Required** | Yes (enforced via org-level 2FA policy) | `terraform/github/main.tf` |

**Status:** ⚠️ **Break-glass bypass is disabled** - No bypass actors are configured. This is the recommended default for production.

**Break-Glass Requirements (A35):**
1. Team membership restricted to on-call engineers only
2. All team members MUST have MFA enabled (enforced via org SSO)
3. Every bypass is logged in the GitHub audit log
4. Bypass approvals require written justification in the PR description
5. Post-incident, the bypass reason is reviewed within 48 hours
6. Membership audit: Review team membership monthly

---

## Required Status Checks

| Check | Purpose | Integration ID |
| ----- | ------- | --------------- |
| `check` | CI lint, typecheck, build, tests | GitHub Actions |
| `secret-scan` | Secret scanning | GitHub Actions |
| `codeql` | CodeQL analysis | GitHub Actions |
| `dependency-review` | Dependency review | GitHub Actions |
| `sbom` | SBOM attestation (OF-09) | GitHub Actions |
| `wrangler-dry-run` | Wrangler dry-run (OF-09) | GitHub Actions |
| `staging-smoke` | Staging smoke test (OF-09) | GitHub Actions |

**Policy:** `strict_required_status_checks_policy = true` - Branches must be up to date before merging.

---

## Authentication Method

| Setting | Value | Source |
| ------- | ----- | ------ |
| **Preferred Auth** | GitHub App Installation Token | `terraform/github/main.tf` (A35) |
| **Fallback Auth** | Fine-grained PAT (deprecated) | `terraform/github/main.tf` |
| **GitHub App ID** | Configured via variable | `terraform/github/main.tf` |
| **GitHub App Installation ID** | Configured via variable | `terraform/github/main.tf` |
| **GitHub App PEM File** | Configured via variable (sensitive) | `terraform/github/main.tf` |

**Status:** ⚠️ **Authentication method not verified** - The actual GitHub App credentials are stored as variables and not documented in the codebase.

---

## Blind Spots (Information Not Available in Codebase)

The following branch-protection configuration details are not documented in the codebase and must be obtained from the GitHub Dashboard or API:

- **Actual applied ruleset state** - Terraform defines the desired state, but the live GitHub configuration may have drifted
- **GitHub App credentials** - App ID, Installation ID, and PEM file are sensitive and not in codebase
- **Organization-level 2FA/SSO status** - Whether org requires 2FA and SSO
- **Break-glass team membership** - If a break-glass team exists, who are its members
- **Actual bypass actor list** - Live bypass actors in the ruleset
- **Code owner file status** - Whether `.github/CODEOWNERS` is configured and enforced

---

## Verification Commands

To verify the live GitHub configuration matches the Terraform state:

```bash
# 1. Confirm a ruleset named "main-protection" exists and is active
gh api repos/groupsmix/affilite-mix/rulesets \
  | jq '.[] | select(.name == "main-protection") | {id, enforcement, target}'

# 2. Verify it requires CI + security checks and review approval
RULESET_ID=$(gh api repos/groupsmix/affilite-mix/rulesets \
  | jq -r '.[] | select(.name == "main-protection") | .id')
gh api "repos/groupsmix/affilite-mix/rulesets/${RULESET_ID}" \
  | jq '.rules | map({type, parameters})'

# 3. Verify bypass list is empty (or only the break-glass team)
gh api "repos/groupsmix/affilite-mix/rulesets/${RULESET_ID}" \
  | jq '.bypass_actors'

# 4. Confirm signed commits requirement
gh api "repos/groupsmix/affilite-mix/rulesets/${RULESET_ID}" \
  | jq '.rules | map(select(.type == "required_signatures"))'

# 5. Export full evidence snapshot
GITHUB_OWNER=groupsmix REPO=affilite-mix \
  ./scripts/github-rulesets-snapshot.sh evidence/$(date +%Y%m%d)
```

---

## Required Actions

1. **Verify live ruleset state** matches Terraform configuration using the verification commands above
2. **Document GitHub App credentials** in a secure location (not in public repo)
3. **Confirm organization-level 2FA/SSO** is enabled
4. **Export evidence snapshot** for audit/compliance review
5. **Schedule quarterly review** of branch-protection policy (per `docs/github-branch-protection.md`)

---

## References

- `docs/github-branch-protection.md` - Complete branch-protection policy documentation
- `terraform/github/branch-protection.tf` - Terraform implementation of ruleset
- `terraform/github/main.tf` - Variables including required_review_count
- `.github/rulesets/main-protection.json` - Portable JSON fallback for forks
- `scripts/github-rulesets-snapshot.sh` - Evidence export script
