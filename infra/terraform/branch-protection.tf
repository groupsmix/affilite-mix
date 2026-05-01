# OF-08: branch protection.
resource "github_branch_protection" "main" {
  repository_id = data.github_repository.this.node_id
  pattern       = "main"
  required_pull_request_reviews { required_approving_review_count = 2 require_code_owner_reviews = true dismiss_stale_reviews = true }
  required_status_checks { strict = true contexts = ["check","secret-scan","codeql","dependency-review","sbom","attest","wrangler-dryrun","staging-smoke"] }
  enforce_admins = true
  require_signed_commits = true
}
