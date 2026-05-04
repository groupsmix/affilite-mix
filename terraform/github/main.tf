# A34: GitHub Repository and Branch Protection Configuration
# CI/CD security hardening based on audit findings

terraform {
  required_providers {
    github = {
      source  = "integrations/github"
      version = "~> 5.0"
    }
  }
}

provider "github" {
  token = var.github_token
  owner = var.github_owner
}

# ═══════════════════════════════════════════════════════════════════════════════
# Repository Data Source
# ═══════════════════════════════════════════════════════════════════════════════

data "github_repository" "this" {
  name = var.repository_name
}

# ═══════════════════════════════════════════════════════════════════════════════
# Branch Protection - Main Branch
# A34#20, A34#25: Enhanced branch protection
# ═══════════════════════════════════════════════════════════════════════════════

resource "github_branch_protection" "main" {
  repository_id = data.github_repository.this.node_id
  pattern       = "main"

  # A34#25: Require 2 approving reviews (was 1)
  required_pull_request_reviews {
    required_approving_review_count = 2
    require_code_owner_reviews      = true
    dismiss_stale_reviews            = true
    restrict_dismissals             = true
    
    # A34#30: CODEOWNERS enforcement for security paths
    # Requires CODEOWNERS file in repo with paths like:
    # /terraform/ @platform-team
    # /.github/workflows/ @security-team
    # /lib/security/ @security-team
  }

  # A34#20: Extended required status checks
  # Includes SBOM, attest, wrangler-dryrun, staging-smoke
  required_status_checks {
    strict = true
    contexts = [
      "check",
      "secret-scan",
      "codeql",
      "dependency-review",
      "sbom",              # A34#20: Supply chain security
      "attest",            # A34#20: SLSA attestation
      "wrangler-dryrun",   # A34#20: Deploy validation
      "staging-smoke",     # A34#20: Integration tests
    ]
  }

  enforce_admins         = true
  require_signed_commits = true
  
  # A34#29: Break-glass bypass configuration
  # The bypass_actors configuration allows emergency merges
  # but with pull_request mode (not always)
  bypass_actors {
    actor_id    = var.break_glass_team_slug != null ? github_team.break_glass[0].id : null
    actor_type  = "Team"
    bypass_mode = "pull_request"  # Requires PR even for break-glass
  }

  # A34#30: Require linear history (no merge commits)
  require_linear_history = true
  
  # A34#30: Require conversation resolution
  require_conversation_resolution = true
}

# ═══════════════════════════════════════════════════════════════════════════════
# Break-Glass Team (Emergency Access)
# A34#29: Documented break-glass team for emergency fixes
# ═══════════════════════════════════════════════════════════════════════════════

resource "github_team" "break_glass" {
  count = var.break_glass_team_slug != null ? 1 : 0

  name        = var.break_glass_team_slug
  description = "Emergency break-glass access for production incidents"
  privacy     = "closed"
}

resource "github_team_repository" "break_glass_access" {
  count = var.break_glass_team_slug != null ? 1 : 0

  team_id    = github_team.break_glass[0].id
  repository = data.github_repository.this.name
  permission = "push"  # Write access for emergency merges
}

# ═══════════════════════════════════════════════════════════════════════════════
# Repository Ruleset (Additional Protection)
# ═══════════════════════════════════════════════════════════════════════════════

resource "github_repository_ruleset" "main" {
  name        = "main-branch-protection"
  repository  = data.github_repository.this.name
  target      = "branch"
  enforcement = "active"

  conditions {
    ref_name {
      include = ["~DEFAULT_BRANCH"]
      exclude = []
    }
  }

  rules {
    # Require signed commits
    required_signatures = true
    
    # Pull request requirements
    pull_request {
      required_approving_review_count = 2
      dismiss_stale_reviews_on_push   = true
      require_code_owner_review       = true
      require_last_push_approval       = true
    }
    
    # Required status checks
    required_status_checks {
      required_check {
        context = "check"
      }
      required_check {
        context = "secret-scan"
      }
      required_check {
        context = "codeql"
      }
      required_check {
        context = "dependency-review"
      }
      required_check {
        context = "sbom"
      }
      required_check {
        context = "attest"
      }
      required_check {
        context = "wrangler-dryrun"
      }
    }
  }

  bypass_actors {
    actor_id    = var.break_glass_team_slug != null ? github_team.break_glass[0].id : null
    actor_type  = "Team"
    bypass_mode = "pull_request"
  }
}

# ═══════════════════════════════════════════════════════════════════════════════
# Repository Settings
# ═══════════════════════════════════════════════════════════════════════════════

resource "github_repository" "this" {
  name        = var.repository_name
  description = "Affilite Mix - Multi-tenant affiliate platform"
  
  # Security settings
  vulnerability_alerts                    = true
  secret_scanning {
    status = "enabled"
  }
  secret_scanning_push_protection {
    status = "enabled"
  }
  
  # Merge settings
  allow_merge_commit     = false  # Require linear history
  allow_squash_merge     = true
  allow_rebase_merge     = false
  delete_branch_on_merge = true
  
  # Other settings
  auto_init = false
  archived  = false
}

# ═══════════════════════════════════════════════════════════════════════════════
# Variables
# ═══════════════════════════════════════════════════════════════════════════════

variable "github_token" {
  description = "GitHub token with repo and admin:org scopes (fine-grained PAT recommended)"
  type        = string
  sensitive   = true
}

variable "github_owner" {
  description = "GitHub organization or user name"
  type        = string
  default     = "groupsmix"
}

variable "repository_name" {
  description = "Name of the repository"
  type        = string
  default     = "affilite-mix"
}

# A34#26: Ensure token is fine-grained PAT (documented in description)
# Classic PAT has full org access; fine-grained is scoped
variable "github_token_type" {
  description = "Type of GitHub token (should be 'fine_grained'). Used for documentation only."
  type        = string
  default     = "fine_grained"
}

# A34#28: Require 2 reviewers (was 1)
variable "required_review_count" {
  description = "Number of required approving reviews"
  type        = number
  default     = 2  # SOC2 SoD requirement
}

# A34#29: Break-glass team slug (null disables break-glass)
variable "break_glass_team_slug" {
  description = "Team slug for break-glass emergency access (null to disable)"
  type        = string
  default     = null
}
