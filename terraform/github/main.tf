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
#   3. SOLO-DEV: peer review is NOT required (single-owner repo — a mandatory
#      review count is unsatisfiable). Re-enable in branch-protection.tf if
#      maintainers are added.
#   4. Direct pushes to main are forbidden — all changes flow through PRs.
#   5. Admin / maintainer bypass is disabled by default. Bypass is granted
#      only to the `break-glass` team listed in
#      `var.break_glass_team_slug`, which exists for documented incident
#      response use only and whose membership is monitored.
#   6. SOLO-DEV: signed commits are NOT required (removed merge friction for
#      single-owner automation/bot commits). Re-enable in branch-protection.tf
#      if a signing policy is adopted.
#   7. Force-pushes and branch deletion are forbidden on main.
#
# The same controls can also be applied via the GitHub API directly using
# the JSON template in `.github/rulesets/main-protection.json`. Use the
# Terraform module for steady-state management; use the JSON template
# (with `gh api`) when bootstrapping a fork or restoring from a backup.
#
# A35: Authentication uses a GitHub App installation token scoped only to
# repository and ruleset permissions, instead of a PAT with broad
# `repo` + `admin:org` scopes.
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

# A35: Use a GitHub App installation token instead of a PAT.
# The GitHub App must be granted only these permissions:
#   * Repository permissions:
#     - Administration: read (for reading repo settings)
#     - Contents: read (for reading repo content)
#   * Organization permissions:
#     - Administration: read (for reading organization settings)
#   * Required for ruleset management:
#     - Repository permissions → Administration: write
#     - Organization permissions → Administration: read
#
# To create a GitHub App:
#   1. Organization Settings → Developer settings → GitHub Apps → New
#   2. Grant ONLY the permissions listed above
#   3. Install the app on the target repository
#   4. Generate a private key and use it to create an installation token
variable "github_app_id" {
  type        = string
  description = "GitHub App ID for the Terraform management app. Used with github_app_installation_id and github_app_pem_file for authentication."
  default     = ""
}

variable "github_app_installation_id" {
  type        = string
  description = "GitHub App installation ID for the target repository."
  default     = ""
}

variable "github_app_pem_file" {
  type        = string
  sensitive   = true
  description = "PEM content of the GitHub App private key. Used to sign JWT for installation token."
  default     = ""
}

# A35: Fallback to fine-grained PAT with minimal scopes only when
# GitHub App auth is not available (legacy / migration path).
# This PAT must have ONLY:
#   * repo (full control of repository) — for ruleset management
#   * admin:org (read) — for reading team data
# DEPRECATED: Migrate to GitHub App authentication.
variable "github_token" {
  type        = string
  sensitive   = true
  description = "DEPRECATED (A35): Fine-grained PAT with repo + admin:org read scopes. Use github_app_id + github_app_installation_id + github_app_pem_file instead."
  default     = ""
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

# SOLO-DEV POLICY: this repository is maintained by a single owner, so a
# mandatory peer-review count is unsatisfiable (you cannot approve your own PR)
# and would make merging impossible. Review gating is therefore disabled and the
# branch is protected by CI status checks + PR-only flow + no-force-push instead.
# Raise this (and re-enable the review requirements in branch-protection.tf) if
# the project later adds maintainers. Must match
# .github/rulesets/main-protection.json required_approving_review_count.
variable "required_review_count" {
  type        = number
  description = "Number of approving PR reviews required. Must match .github/rulesets/main-protection.json required_approving_review_count. 0 = solo-dev (no peer review)."
  default     = 0
  validation {
    condition     = var.required_review_count >= 0
    error_message = "required_review_count cannot be negative."
  }
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

# A35: Break-glass policy requires MFA/SSO for all bypass actors.
# NOTE: This variable is DOCUMENTATION-ONLY — flipping it does not change
# any Terraform resource. The GitHub API/rulesets API has no native "require
# MFA for bypass actors" mechanism; the control must be enforced at the
# organization level via GitHub Organization SSO/MFA policy settings
# (Organization Settings -> Authentication security -> Require two-factor
# authentication). Audit break-glass team membership regularly.
variable "break_glass_require_mfa" {
  type        = bool
  description = "A35: Documents that MFA is required for break-glass team members. Enforcement is via GitHub Org-level 2FA policy — this variable does not change any Terraform resource."
  default     = true
}

# A35: Configure the GitHub provider to use GitHub App authentication
# when available, falling back to PAT for legacy compatibility.
#
# IMPORTANT: The GitHub provider blocks token-based auth when an app_auth {}
# block is present — even if all three app fields are null. We therefore use
# a dynamic block so the app_auth stanza only appears when all three GitHub
# App inputs are actually supplied. This ensures the PAT path works correctly
# during migration and in environments that haven't yet provisioned an App.
provider "github" {
  owner = var.github_owner

  # Only render app_auth when all three required fields are provided.
  # If any field is missing, the block is omitted and token auth is used instead.
  dynamic "app_auth" {
    for_each = (
      var.github_app_id != "" &&
      var.github_app_installation_id != "" &&
      var.github_app_pem_file != ""
    ) ? [1] : []
    content {
      id              = var.github_app_id
      installation_id = var.github_app_installation_id
      pem_file        = var.github_app_pem_file
    }
  }

  # Fallback to PAT when GitHub App auth is not configured.
  token = (var.github_app_id == "" || var.github_app_installation_id == "" || var.github_app_pem_file == "") ? var.github_token : null
}
