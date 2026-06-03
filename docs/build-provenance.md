# Build Provenance & Release Integrity

> **A175/A176 Remediation** — Documents build provenance gaps and OIDC key custody.
> **Last updated:** 2026-05-29

---

## 1. Current State

The CI pipeline (`ci.yml:473-495`) generates SLSA provenance via `attest-build-provenance@v2` and signs artifacts with cosign/Sigstore keyless signing (OIDC-based). This provides:

- Build attestation tied to the GitHub Actions workflow run
- Transparency log entry in Rekor
- Verifiable link between source commit and deployed artifact

## 2. Known Gaps

### 2a. Non-Hermetic Build (A175)

The build is **not hermetic or reproducible**:

- `npm ci` fetches dependencies from the public npm registry at build time.
- Node.js version is pinned via `.nvmrc` but the exact OS image and system libraries vary.
- No content-addressable dependency cache is used (e.g., no vendor directory or `npm pack` archive).

**Accepted risk:** For a small team deploying via GitHub Actions, the risk of a non-hermetic build is low. The Socket.dev supply-chain scan (A173) and npm audit (security.yml) mitigate dependency-substitution attacks. Full hermeticity (SLSA L3+) is not pursued at this time.

**To achieve hermeticity in the future:**

1. Vendor `node_modules` or use a lockfile-aware cache.
2. Pin the runner image SHA in the workflow.
3. Use `--prefer-offline` with a pre-populated cache.

### 2b. No Two-Person Release Gate (A175)

The current release process requires 2 PR reviewers (enforced by branch protection), but there is no distinct **two-person release gate** at the deployment step:

- Any merge to `main` triggers automatic deployment.
- A single person with merge permissions can deploy after obtaining 2 reviews.

**Accepted risk:** The 2-reviewer PR rule provides adequate separation of duties for the current team size.

**A175-F2 — Recommended improvement:** Add a GitHub Environment protection rule on the `production` environment requiring at least 1 additional approver before the deploy workflow executes. This creates a distinct two-person gate between "code approved" and "code deployed":

1. Go to Repository Settings → Environments → Create `production`.
2. Enable "Required reviewers" and add the security lead or a deploy-approver team.
3. Update `.github/workflows/deploy.yml` to reference `environment: production`.

This change does not require code changes — it is a GitHub configuration step.

---

## 3. OIDC Key Custody & Compromise Procedure (A176)

### Trust Model

Sigstore keyless signing uses GitHub's OIDC identity provider as the trust root:

- **OIDC Subject:** `repo:groupsmix/affilite-mix:ref:refs/heads/main`
- **Issuer:** `https://token.actions.githubusercontent.com`
- No long-lived signing key exists; each build gets a short-lived certificate from Fulcio.

### Protection

The OIDC identity is protected by:

1. GitHub's branch protection rules (2 reviewers, CODEOWNERS, status checks)
2. Repository admin access controls (org owner + security lead only)
3. Workflow file changes require `@groupsmix/security` review (CODEOWNERS)

### Compromise Procedure

If the GitHub OIDC identity is suspected compromised (e.g., unauthorized workflow run, stolen org admin credentials):

1. **Immediately** disable GitHub Actions on the repository.
2. **Rotate** all GitHub org admin credentials and enforce re-authentication.
3. **Audit** the Rekor transparency log for any unauthorized signing events:
   ```bash
   rekor-cli search --rekor_server https://rekor.sigstore.dev \
     --email "groupsmix/affilite-mix" | head -20
   ```
4. **Review** all deployments since the suspected compromise.
5. **Revoke** any compromised tokens and re-deploy from a verified clean commit.
6. **Post-mortem** per `docs/incident-response.md`.
