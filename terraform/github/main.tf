###############################################################################
# GitHub repository hardening for affilite-mix.
#
# Codifies the branch protection / ruleset policy as Terraform IaC so the
# controls are reviewable, diffable, and reproducible across forks. The
# canonical policy this module enforces (also documented in
# docs/github-branch-protection.md):
#
#   1. CI is a required status check on PRs to main.
#   2. The security workflow is a required status check on PRs to main.
#   3. PRs require at least one review approval and dismiss stale reviews
#      on new commits.
#   4. Direct pushes to main are forbidden — all changes flow through PRs.
#   5. Admin / maintainer bypass is disabled by default. Bypass is granted
#      only to the `break-glass` team listed in
#      `var.break_glass_team_slug`, which exists for documented incident
#      response use only and whose membership is monitored.
#   6. Signed commits are required on main.
#   7. Force-pushes and branch deletion are forbidden on main.
#
# The same controls can also be applied via the GitHub API directly using
# the JSON template in `.github/rulesets/main-protection.json`. Use the
# Terraform module for steady-state management; use the JSON template
# (with `gh api`) when bootstrapping a fork or restoring from a backup.
#
# State backend is intentionally left unset — wire up the team's preferred
# backend (Terraform Cloud, S3, etc.) before running `terraform init` for
# real.
###############################################################################

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
  }
}

variable "github_token" {
  type        = string
  sensitive   = true
  description = "GitHub PAT or app token with `repo` + `admin:org` ruleset write scopes for the target repository."
}

variable "github_owner" {
  type        = string
  description = "GitHub organization or user that owns the repository (e.g. \"groupsmix\")."
}

variable "repository" {
  type        = string
  description = "Repository name (e.g. \"affilite-mix\")."
  default     = "affilite-mix"
}

variable "default_branch" {
  type        = string
  description = "Branch to protect with the ruleset."
  default     = "main"
}

variable "required_status_checks" {
  type = list(object({
    context        = string
    integration_id = optional(number)
  }))
  description = <<-EOT
    Status checks that must pass before a PR can merge into the default
    branch. `context` is the check name as it appears in the GitHub UI;
    `integration_id` optionally pins the check to a specific GitHub App so
    that an attacker who runs a same-named check from a different app
    cannot satisfy the rule.
  EOT
  default = [
    { context = "check" },             # ci.yml :: check job
    { context = "secret-scan" },       # security.yml :: secret scanning job
    { context = "codeql" },            # security.yml :: CodeQL analysis
    { context = "dependency-review" }, # security.yml :: dep review
    # OF-09: Additional required checks for supply-chain + deploy safety.
    { context = "sbom" },             # sbom.yml :: SBOM attestation
    { context = "wrangler-dry-run" }, # deploy.yml :: Wrangler dry-run
    { context = "staging-smoke" },    # deploy-gradual.yml :: staging smoke test
  ]
}

variable "required_review_count" {
  type        = number
  description = "Number of approving PR reviews required."
  # OF-09: Require at least 2 reviewers to prevent single-actor merges.
  default = 2
}

variable "break_glass_team_slug" {
  type        = string
  description = <<-EOT
    Slug of the GitHub team allowed to bypass this ruleset for documented
    break-glass scenarios (e.g. an out-of-hours hotfix when CI is down).
    Membership of this team must be audited regularly. Set to null to
    disable bypass entirely.
  EOT
  default     = null
}

provider "github" {
  token = var.github_token
  owner = var.github_owner
}
