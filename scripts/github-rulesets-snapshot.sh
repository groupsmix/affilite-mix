#!/usr/bin/env bash
# scripts/github-rulesets-snapshot.sh
#
# Snapshot the live GitHub branch-protection / ruleset configuration for
# this repository as audit evidence. Companion to
# terraform/github/branch-protection.tf — the Terraform module is the
# source of truth, this script proves the live config matches.
#
# What it captures (JSON, one file per resource):
#   - All repository rulesets (full body, including rules + bypass_actors)
#   - Legacy classic branch protection on the default branch (if any)
#   - The list of repository collaborators with admin / maintain access,
#     so we can prove that the bypass-actor allow-list is actually small
#   - The repository's general settings (default branch, allow_forking,
#     web_commit_signoff_required, etc.)
#
# Usage:
#   GITHUB_OWNER=groupsmix REPO=affilite-mix \
#     ./scripts/github-rulesets-snapshot.sh [output_dir]
#
# Defaults:
#   GITHUB_OWNER  groupsmix
#   REPO          affilite-mix
#   output_dir    gh-snapshot-<owner>-<repo>-<YYYYMMDD-HHMMSS>
#
# Auth:
#   Uses `gh` CLI auth. Run `gh auth status` first; the token must have
#   `repo` scope plus `read:org` if rulesets reference org teams as
#   bypass actors (so we can resolve the team names in the dump).

set -euo pipefail

GITHUB_OWNER="${GITHUB_OWNER:-groupsmix}"
REPO="${REPO:-affilite-mix}"
OUT="${1:-gh-snapshot-${GITHUB_OWNER}-${REPO}-$(date +%Y%m%d-%H%M%S)}"

if ! command -v gh >/dev/null 2>&1; then
  echo "error: gh CLI not found. install from https://cli.github.com/" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq not found." >&2
  exit 1
fi

mkdir -p "${OUT}"
echo "Writing snapshot to ${OUT}/"

# ────────────────────────────────────────────────────────────────────────
# 1. Repository general settings
# ────────────────────────────────────────────────────────────────────────
gh api "repos/${GITHUB_OWNER}/${REPO}" \
  | jq '{
      default_branch,
      allow_forking,
      web_commit_signoff_required,
      delete_branch_on_merge,
      allow_squash_merge,
      allow_merge_commit,
      allow_rebase_merge,
      visibility,
      archived,
      disabled
    }' \
  > "${OUT}/repo-settings.json"

# ────────────────────────────────────────────────────────────────────────
# 2. Rulesets — list, then fetch full body for each
# ────────────────────────────────────────────────────────────────────────
gh api "repos/${GITHUB_OWNER}/${REPO}/rulesets" \
  > "${OUT}/rulesets-index.json"

mkdir -p "${OUT}/rulesets"
jq -r '.[].id' "${OUT}/rulesets-index.json" | while read -r RULESET_ID; do
  [ -z "${RULESET_ID}" ] && continue
  gh api "repos/${GITHUB_OWNER}/${REPO}/rulesets/${RULESET_ID}" \
    > "${OUT}/rulesets/${RULESET_ID}.json"
done

# ────────────────────────────────────────────────────────────────────────
# 3. Legacy classic branch protection on the default branch (may 404)
# ────────────────────────────────────────────────────────────────────────
DEFAULT_BRANCH=$(jq -r '.default_branch' "${OUT}/repo-settings.json")
if gh api "repos/${GITHUB_OWNER}/${REPO}/branches/${DEFAULT_BRANCH}/protection" \
     > "${OUT}/branch-protection-legacy.json" 2>/dev/null; then
  :
else
  rm -f "${OUT}/branch-protection-legacy.json"
  echo "(no legacy classic branch protection — rulesets only)" \
    > "${OUT}/branch-protection-legacy.txt"
fi

# ────────────────────────────────────────────────────────────────────────
# 4. Collaborators with admin / maintain access (bypass-actor surface)
# ────────────────────────────────────────────────────────────────────────
gh api --paginate "repos/${GITHUB_OWNER}/${REPO}/collaborators?affiliation=direct" \
  | jq '[.[] | {login, role_name, permissions}]' \
  > "${OUT}/collaborators-direct.json"

# ────────────────────────────────────────────────────────────────────────
# Done
# ────────────────────────────────────────────────────────────────────────
echo "Snapshot complete:"
find "${OUT}" -type f | sort
