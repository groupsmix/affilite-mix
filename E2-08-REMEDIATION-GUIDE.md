# E2-08 Remediation Guide: Audit Report History Cleanup

**Audit Finding:** E2-08 — Internal audit reports in a public repo (and in git history)
**Severity:** Medium · Confidence: High · Domain: Security / Compliance

## Current State Assessment

**HEAD (Current Files):** ✅ Clean
- `docs/audits/` directory does not exist in current HEAD
- Sensitive audit reports have been removed from current files
- Gitignore patterns block `docs/audits/` and related patterns

**Git History:** ❌ Contaminated
- Pre-removal commits still contain sensitive audit reports in git history
- Files removed in PR #789 are still accessible via `git log` and `git checkout`
- Historical commits contain security methodology, prior weaknesses, and sensitive findings

**Operational Audit Docs:** ✅ Correctly Public
These files are intentionally public and should remain:
- `docs/audit-log-review-runbook.md` - Operational runbook
- `docs/pr-audit-requirements.md` - Development process doc  
- `docs/api-route-audit.md` - API security audit checklist

## Security Risk

**Why This Matters:**
1. **Information Disclosure:** Git history is publicly accessible in the GitHub repository
2. **Attacker Recon:** Historical audit reports reveal security posture, methodology, and prior weaknesses
3. **Compliance:** Weakens "we don't leak security internals" claims in security reviews
4. **Secret Exposure:** Historical reports may contain references to secrets, endpoints, or internal systems

## Remediation Overview

The remediation requires:
1. **Git History Cleanup:** Remove sensitive files from all historical commits
2. **Force Push:** Rewrite public git history (requires coordination)
3. **Secret Rotation:** Rotate any secrets exposed in historical reports
4. **Private Storage:** Establish private repository for sensitive audit reports

**⚠️ CRITICAL:** This operation rewrites git history and requires:
- Git repository admin access
- Coordination with all collaborators
- Force push permissions
- Potential service interruption during cleanup

## Remediation Steps

### Step 1: Backup Repository

```bash
# Create a complete backup before any history rewriting
cd /path/to/parent/dir
git clone --mirror <your-repo-url> affilite-mix-backup-$(date +%Y%m%d)
cd affilite-mix-backup-$(date +%Y%m%d)
git remote remove origin
# Store this backup safely
```

### Step 2: Install Required Tools

```bash
# Option A: git-filter-repo (recommended)
pip install git-filter-repo

# Option B: BFG Repo-Cleaner  
# Download from: https://rtyley.github.io/bfg-repo-cleaner/
```

### Step 3: Clean Git History

#### Using git-filter-repo:

```bash
cd affilite-mix

# Remove docs/audits/ directory from all history
git filter-repo --path docs/audits/ --invert-paths

# Remove specific audit file patterns
git filter-repo --path-glob 'docs/*-audit-*.md' --invert-paths
git filter-repo --path-glob 'docs/technical-audit-*.md' --invert-paths
git filter-repo --path-glob '/audit-*.md' --invert-paths

# Verify cleanup
git log --all --pretty=format:"%H %s" -- '*audit*' '*audit*/**' 'docs/*-audit-*.md'
```

#### Using BFG:

```bash
# Use your backup repository
cd /path/to/affilite-mix-backup-$(date +%Y%m%d)

# Remove audit directory
bfg --delete-folders docs/audits

# Remove audit file patterns
bfg --delete-globs '*-audit-*.md'
bfg --delete-globs 'technical-audit-*.md'

# Cleanup
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

### Step 4: Force Push to Remote

**⚠️ CRITICAL:** Coordinate with all collaborators before this step.

```bash
# Notify all collaborators to stop commits/pulls
# Force push cleaned history
git push origin --force --all
git push origin --force --tags
```

### Step 5: Collaborator Re-clone

All collaborators must re-clone:
```bash
mv affilite-mix affilite-mix-old
git clone <your-repo-url> affilite-mix
```

### Step 6: Establish Private Audit Storage

Create private repository `groupsmix/affilite-mix-audits` for sensitive audit reports.

### Step 7: Rotate Exposed Secrets

Review historical reports and rotate any exposed secrets/API keys.

## Verification Checklist

- [ ] Backup repository created
- [ ] Git history cleaned
- [ ] Force push completed
- [ ] Audit files removed from GitHub history
- [ ] Operational docs still accessible
- [ ] All collaborators re-cloned
- [ ] Private audit repository created
- [ ] Exposed secrets rotated

## Timeline Estimate

- **History Cleanup:** 2-4 hours
- **Force Push & Verification:** 1-2 hours
- **Collaborator Coordination:** 2-4 hours
- **Private Storage Setup:** 2-3 hours

**Total:** 7-13 hours (mostly coordination-dependent)

## References

- git-filter-repo: https://htmlpreview.github.io/www.github.com/newren/git-filter-repo/
- BFG Repo-Cleaner: https://rtyley.github.io/bfg-repo-cleaner/
