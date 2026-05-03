# OF-08: branch protection - 2 reviews + extended required checks.
# Aligned with terraform/github/branch-protection.tf (ruleset equivalent).
resource "github_branch_protection" "main" {
  repository_id = data.github_repository.this.node_id
  pattern       = "main"
  required_pull_request_reviews {
    required_approving_review_count = 2
    require_code_owner_reviews      = true
    dismiss_stale_reviews           = true
    require_last_push_approval      = true
  }
  required_status_checks {
    strict = true
    contexts = [
      "check",             # ci.yml :: check job
      "secret-scan",       # security.yml :: secret scanning job
      "codeql",            # security.yml :: CodeQL analysis
      "dependency-review", # security.yml :: dep review
      "sbom",              # sbom.yml :: SBOM attestation
      "attest",            # sbom.yml :: attestation verification
      "wrangler-dry-run",  # deploy.yml :: Wrangler dry-run
      "staging-smoke",     # deploy-gradual.yml :: staging smoke test
    ]
  }
  enforce_admins         = true
  require_signed_commits = true
}
