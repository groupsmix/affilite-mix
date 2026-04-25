# GitHub Rulesets & Workflow Security

## Branch Protection (main)
We enforce the following rules via GitHub branch protection / repository rulesets:
1. **Require a pull request before merging:** All commits to `main` must go through a PR.
2. **Require approvals:** At least 1 reviewer approval is required.
3. **Require status checks to pass:** The `CI` and `db-audit` workflows must succeed.
4. **Do not allow bypassing the above settings:** Even repository administrators cannot bypass PR reviews or CI checks (except via documented break-glass service accounts).
5. **Require signed commits:** Commits pushed to `main` must have verified signatures.

## Action Security
- All `.github/workflows/*.yml` files declare explicit, least-privilege `permissions` scopes.
- Only the `Deploy` workflow has `deployments: write` permission.
- All third-party actions (`actions/checkout`, etc.) are pinned by exact commit SHA to prevent supply-chain attacks.
