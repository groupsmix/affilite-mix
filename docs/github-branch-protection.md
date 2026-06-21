# GitHub Branch Protection / Ruleset Policy

Authoritative policy for the protections that MUST be active on the
`main` branch of `groupsmix/affilite-mix`. Owned by Security; reviewed
quarterly.

The policy is enforced as **code** — drift between this document and the
live GitHub config is an audit finding, not an acceptable variance.

## Required controls

| #    | Control                                         | Why                                                                                                                      | Source of truth                                                                    |
| ---- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| BP-1 | CI is a required status check on PRs to `main`  | Block merging code that doesn't pass lint, typecheck, build, tests.                                                      | `terraform/github/branch-protection.tf`                                            |
| BP-2 | Security workflow is a required status check    | Block merging code that fails secret scan, CodeQL, dependency-review, npm audit.                                         | `terraform/github/branch-protection.tf`                                            |
| BP-3 | Peer review (DISABLED — solo-dev)               | Single-owner repo: a mandatory review count is unsatisfiable (cannot self-approve). PR-only flow + CI checks substitute. | `terraform/github/branch-protection.tf` (`pull_request`)                           |
| BP-4 | No direct push to `main`                        | All changes must flow through a PR; rulesets reject `git push origin main`.                                              | `terraform/github/branch-protection.tf` (`pull_request` rule + no `update` bypass) |
| BP-5 | No admin / maintainer bypass except break-glass | Default GitHub behavior lets admins bypass protection silently. Disabled here.                                           | `terraform/github/branch-protection.tf` (`bypass_actors`)                          |
| BP-6 | Signed commits (DISABLED — solo-dev)            | Removed to unblock single-owner bot/automation commits. Re-enable for a signing policy.                                  | `terraform/github/branch-protection.tf` (`required_signatures`)                    |
| BP-7 | No force-push, no branch deletion on `main`     | Preserve history. Force-push would silently rewrite audit trail.                                                         | `terraform/github/branch-protection.tf` (`non_fast_forward`, `deletion`)           |
| BP-8 | Linear history                                  | Easier `git bisect`; matches our rebase-and-merge workflow.                                                              | `terraform/github/branch-protection.tf` (`required_linear_history`)                |

## Break-glass policy (BP-5 detail)

Admins do **not** automatically bypass these rules. Bypass is granted to
a single GitHub team — whose slug is set in
`var.break_glass_team_slug` — and only in `pull_request` mode (i.e. the
admin must still open a PR; they can self-merge it without a second
reviewer in an emergency, but the merge is recorded in the audit log).

Operating constraints on the break-glass team:

1. Membership is reviewed monthly as part of the access-recertification
   process (see [`docs/access-recertification.md`](./access-recertification.md)).
2. Every bypass-mediated merge MUST be paired with an incident ticket
   that explains why normal flow was insufficient.
3. The team has zero default members. Membership is granted only for
   the duration of an active incident and is removed after closure.

If `var.break_glass_team_slug = null` (the recommended default), the
ruleset has no bypass actors at all.

## Implementation

### Terraform (preferred)

The ruleset is defined in [`terraform/github/`](../terraform/github/). To
apply or reconcile drift:

```bash
cd terraform/github
terraform init
terraform plan
terraform apply
```

### Portable JSON (fallback / bootstrap)

For forks and disaster-recovery scenarios, the same policy is mirrored
as a GitHub API payload at
[`.github/rulesets/main-protection.json`](../.github/rulesets/main-protection.json).
Apply with:

```bash
jq 'del(._comment)' .github/rulesets/main-protection.json | \
  gh api -X POST repos/groupsmix/affilite-mix/rulesets --input -
```

## Evidence export

For audit / compliance reviews, snapshot the live GitHub config:

```bash
GITHUB_OWNER=groupsmix REPO=affilite-mix \
  ./scripts/github-rulesets-snapshot.sh evidence/$(date +%Y%m%d)
```

The script writes:

- `repo-settings.json` — default branch, signoff, merge-style, etc.
- `rulesets-index.json` + `rulesets/<id>.json` — every active ruleset
  with full rules and bypass actors.
- `branch-protection-legacy.json` — legacy classic branch protection
  (should be empty if rulesets are the canonical mechanism).
- `collaborators-direct.json` — direct admin/maintain collaborators.

Commit the snapshot dir (or attach to the audit packet) as evidence
that BP-1…BP-8 are live.

## Verifying the controls quickly

```bash
# 1. Confirm a ruleset named "main-protection" exists and is active.
gh api repos/groupsmix/affilite-mix/rulesets \
  | jq '.[] | select(.name == "main-protection") | {id, enforcement, target}'

# 2. Verify it requires CI + security checks and review approval.
RULESET_ID=$(gh api repos/groupsmix/affilite-mix/rulesets \
  | jq -r '.[] | select(.name == "main-protection") | .id')
gh api "repos/groupsmix/affilite-mix/rulesets/${RULESET_ID}" \
  | jq '.rules | map({type, parameters})'

# 3. Verify bypass list is empty (or only the break-glass team).
gh api "repos/groupsmix/affilite-mix/rulesets/${RULESET_ID}" \
  | jq '.bypass_actors'

# 4. Confirm signed commits requirement.
gh api "repos/groupsmix/affilite-mix/rulesets/${RULESET_ID}" \
  | jq '.rules | map(select(.type == "required_signatures"))'
```
