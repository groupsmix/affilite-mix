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
