# GitHub repository hardening (Terraform)

Terraform module that codifies the `main` branch ruleset for this
repository. Mirror of the policy documented in
[`docs/github-branch-protection.md`](../../docs/github-branch-protection.md).

## What this enforces

| Control                                                    | Implemented in                                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| CI required on PRs to `main`                               | `branch-protection.tf` → `required_status_checks`                                     |
| Security workflow required on PRs to `main`                | `branch-protection.tf` → `required_status_checks`                                     |
| Review approval required (≥ 1, dismiss stale, code owners) | `branch-protection.tf` → `pull_request`                                               |
| No direct push to `main`                                   | `branch-protection.tf` → ruleset on `refs/heads/main` (no `creation`/`update` bypass) |
| No admin bypass except documented break-glass team         | `branch-protection.tf` → `bypass_actors` (only `var.break_glass_team_slug`)           |
| Signed commits / provenance                                | `branch-protection.tf` → `required_signatures = true`                                 |
| No force-push / no branch deletion on `main`               | `branch-protection.tf` → `non_fast_forward`, `deletion = true`                        |

## Apply

```bash
export TF_VAR_github_token=ghs_xxx        # GitHub App / fine-grained PAT
export TF_VAR_github_owner=groupsmix
# Optional — only set this once a `break-glass` team exists in the org.
# export TF_VAR_break_glass_team_slug=break-glass

cd terraform/github
terraform init
terraform plan
terraform apply
```

The Terraform state is the source of truth. Drift between live GitHub
config and this module should be considered an audit finding — see the
evidence export below.

## Export evidence (snapshot the live ruleset)

After applying, snapshot the live config so reviewers can audit it
without GitHub access:

```bash
GITHUB_OWNER=groupsmix REPO=affilite-mix \
  ./scripts/github-rulesets-snapshot.sh evidence/$(date +%Y%m%d)
```

That script writes the live ruleset JSON, the branch-protection legacy
config (if any), and the list of repository admins / bypass actors to
the chosen output directory. Commit (or attach to the audit packet) the
result for compliance evidence.

## Provider version

Pinned to `integrations/github ~> 6.0`. The `github_repository_ruleset`
resource was introduced in v6 — earlier versions only support legacy
branch protection, which lacks the `bypass_actors` block this module
relies on for the "no admin bypass" control.
