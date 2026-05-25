###############################################################################
# Repository ruleset enforcing the branch-protection policy on the default
# branch. Modelled on GitHub's "Branch ruleset" resource (which is the
# successor to legacy "Branch protection rules" — rulesets stack, support
# bypass actors as code, and surface in the audit log).
###############################################################################

# Look up the break-glass team (if configured) so we can reference it in
# bypass_actors below. Setting `var.break_glass_team_slug = null` skips
# the data lookup entirely and produces a ruleset with zero bypass actors.
data "github_team" "break_glass" {
  count = var.break_glass_team_slug == null ? 0 : 1
  slug  = var.break_glass_team_slug
}

# A35: Enforce MFA/SSO for the break-glass team via organization policy.
# This is a documentation resource — actual MFA enforcement is done at
# the organization level via SSO + required MFA. The ruleset below
# documents the requirement in the bypass actor comment.
resource "github_repository_ruleset" "main_protection" {
  name        = "main-protection"
  repository  = var.repository
  target      = "branch"
  enforcement = "active"

  conditions {
    ref_name {
      include = ["refs/heads/${var.default_branch}"]
      exclude = []
    }
  }

  # ---------------------------------------------------------------------------
  # Bypass actors
  #
  # GitHub's default ruleset allows any repo admin to bypass — that's
  # exactly what we want to disable. We only include the break-glass team
  # (if configured) and only grant `pull_request` bypass mode, NOT
  # always-on bypass. `bypass_mode = "pull_request"` means a member of
  # the team must still open a PR, but they can self-merge it without a
  # second reviewer in an emergency. Every bypass shows up in the audit
  # log.
  #
  # A35: Break-glass bypass requires:
  #   1. Team membership is restricted to on-call engineers only.
  #   2. All team members MUST have MFA enabled (enforced via org SSO).
  #   3. Every bypass is logged in the GitHub audit log.
  #   4. Bypass approvals require written justification in the PR description.
  #   5. Post-incident, the bypass reason is reviewed in the next security
  #      standup (within 48 hours).
  # ---------------------------------------------------------------------------
  dynamic "bypass_actors" {
    for_each = var.break_glass_team_slug == null ? [] : [1]
    content {
      actor_id    = data.github_team.break_glass[0].id
      actor_type  = "Team"
      bypass_mode = "pull_request"
    }
  }

  rules {
    # 4. No direct pushes — every change must go through a PR.
    # 7. No force-push and no branch deletion on main.
    creation                = false
    update                  = false
    deletion                = true
    non_fast_forward        = true
    required_linear_history = true

    # 6. Signed commits required.
    required_signatures = true

    # 3. PR review requirements.
    # A34: required_review_count defaults to 2 (single source of truth
    # with .github/rulesets/main-protection.json).
    pull_request {
      required_approving_review_count   = var.required_review_count
      dismiss_stale_reviews_on_push     = true
      require_code_owner_review         = true
      require_last_push_approval        = true
      required_review_thread_resolution = true
    }

    # 1, 2. CI + security workflow are required status checks.
    required_status_checks {
      strict_required_status_checks_policy = true

      dynamic "required_check" {
        for_each = var.required_status_checks
        content {
          context        = required_check.value.context
          integration_id = try(required_check.value.integration_id, null)
        }
      }
    }
  }
}

output "ruleset_id" {
  value       = github_repository_ruleset.main_protection.id
  description = "Numeric ID of the managed ruleset (used by `gh api` for evidence export)."
}

# A35: Output the break-glass policy requirements as documentation.
output "break_glass_policy" {
  value       = <<-EOT
    A35 BREAK-GLASS POLICY:
    =======================
    1. BREAK_GLASS_TEAM: ${var.break_glass_team_slug != null ? var.break_glass_team_slug : "(disabled — no bypass allowed)"}
    2. BYPASS_MODE: pull_request (must open PR, can self-merge)
    3. MFA_REQUIRED: ${var.break_glass_require_mfa ? "YES (enforced via org SSO)" : "WARNING: MFA not enforced"}
    4. AUDIT_LOG: Every bypass is recorded in GitHub audit log
    5. POST-INCIDENT REVIEW: Required within 48 hours of any bypass
    6. MEMBERSHIP AUDIT: Review team membership monthly

    SSO/MFA must be configured at the organization level; Terraform
    cannot enforce MFA on individual users. Ensure:
      - Organization Settings → Authentication security →
        Require two-factor authentication = ENABLED
      - Organization Settings → SAML single sign-on →
        Require SAML SSO authentication = ENABLED (if using SSO)
  EOT
  description = "A35: Break-glass policy documentation and MFA requirements."
}
