# SBOM Retention Policy

Audit finding: **G-41 — SBOM upload-as-artifact / R2 retention.**

This document captures the long-term retention strategy for the
Software Bill of Materials (SBOM) artifacts produced by
`.github/workflows/sbom.yml`, the operational SLA, and the restore
procedure used during downstream vulnerability triage (e.g. when a
CVE is published against a dependency that shipped in a release that
is no longer covered by GitHub Actions artifact retention).

## Retention Tiers

| Tier | Storage                                 | Retention | Purpose                                                  |
| ---- | --------------------------------------- | --------- | -------------------------------------------------------- |
| 1    | `actions/upload-artifact` workflow run  | 400 days  | Fast access for recent triage, integrates with re-run    |
| 2    | `softprops/action-gh-release` assets    | Forever\* | Per-release artifacts attached to the GitHub release     |
| 3    | Cloudflare R2 (`SBOM_R2_BUCKET`)        | ≥3 years  | Long-term audit / supply-chain forensics                 |
| 4    | GitHub Artifact Attestations (sigstore) | Forever   | Cryptographic provenance, queryable via `gh attestation` |

\* As long as the GitHub release exists. Tier 3 protects against
deletion/rotation of releases.

## Tier-3 (R2) Layout

Every SBOM workflow run that has the four R2 secrets configured
mirrors its outputs to:

```
s3://${SBOM_R2_BUCKET}/sbom/<commit-sha>/
  ├─ sbom.cdx.json            (CycloneDX SBOM)
  ├─ sbom.cdx.json.bundle     (cosign keyless signature bundle)
  ├─ sbom.spdx.json           (SPDX SBOM)
  ├─ sbom.spdx.json.bundle    (cosign keyless signature bundle)
  └─ sbom.manifest.json       (commit_sha / ref / workflow_run_id / generated_at)
```

The commit SHA is the source of truth — release tags can be moved
or deleted, but a SHA is immutable. The manifest file makes each
prefix self-describing so an auditor can verify the archive without
relying on the GitHub Actions run still existing.

## Retention SLA

- **Minimum retention:** 3 years from the upload timestamp.
- **Storage class:** R2 standard (no lifecycle deletion). Apply a
  bucket-level lifecycle rule **only** to expire objects older than
  the audit-mandated retention window — never to delete based on
  access patterns.
- **Deletion:** must go through the security review board. Deletions
  outside the lifecycle rule must be logged in
  `docs/incidents/YYYY-MM-DD-<slug>.md`.
- **Bucket-level controls:** versioning enabled; bucket lock /
  object lock recommended where supported.

## Required Repository Secrets

The workflow step is **conditionally enabled**: if any of the four
secrets below is unset (typical for forks / external contributor
PRs) the archive step is skipped and the workflow logs a warning
annotation, but the run still succeeds.

| Secret                      | Value                                                   |
| --------------------------- | ------------------------------------------------------- |
| `SBOM_R2_ACCOUNT_ID`        | Cloudflare account ID hosting the R2 bucket             |
| `SBOM_R2_BUCKET`            | R2 bucket name (e.g. `affilite-mix-sbom-archive`)       |
| `SBOM_R2_ACCESS_KEY_ID`     | R2 S3-compatible access key (write-only IAM-equivalent) |
| `SBOM_R2_SECRET_ACCESS_KEY` | R2 S3-compatible secret access key                      |

The credential should be **scoped to the SBOM bucket only** with
`PutObject` permission. It must NOT be reused for the application's
runtime R2 buckets (`R2_*` env vars in `.env.example`).

## One-Time Bootstrap

```bash
# 1. Create the long-term archive bucket (Cloudflare dashboard or wrangler)
npx wrangler r2 bucket create affilite-mix-sbom-archive

# 2. Create a scoped R2 API token via the Cloudflare dashboard:
#    Profile → API Tokens → R2 → Create API Token
#    Permissions: Object Read & Write
#    Buckets: only `affilite-mix-sbom-archive`

# 3. Add the four secrets to the GitHub repo:
gh secret set SBOM_R2_ACCOUNT_ID
gh secret set SBOM_R2_BUCKET
gh secret set SBOM_R2_ACCESS_KEY_ID
gh secret set SBOM_R2_SECRET_ACCESS_KEY

# 4. Apply a 3-year (1100-day) minimum-retention lifecycle rule
#    via the Cloudflare R2 dashboard. (R2 lifecycle rules are
#    configured per-bucket; see Cloudflare docs.)
```

## Restore Procedure

To pull the archived SBOM for a historical commit SHA:

```bash
export SBOM_R2_ACCOUNT_ID=<account-id>
export SBOM_R2_BUCKET=affilite-mix-sbom-archive
aws s3 cp \
  "s3://${SBOM_R2_BUCKET}/sbom/<commit-sha>/" \
  ./restored-sbom/ \
  --recursive \
  --endpoint-url "https://${SBOM_R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

# Verify cosign signature (keyless / GitHub OIDC)
cosign verify-blob \
  --bundle ./restored-sbom/sbom.cdx.json.bundle \
  --certificate-identity-regexp '^https://github\.com/groupsmix/affilite-mix/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  ./restored-sbom/sbom.cdx.json
```

If signature verification fails, do not trust the SBOM — file an
incident under `docs/incidents/`.

## Why 3 Years?

- Most regulatory frameworks (SOC 2, ISO 27001, the EU Cyber Resilience
  Act draft, NIST SSDF) require a minimum 3-year retention window for
  supply-chain artifacts so post-disclosure CVE triage can reach back
  through prior releases.
- GitHub Actions caps `actions/upload-artifact` retention at 400 days,
  which is **insufficient** on its own.
- Release-attached assets (Tier 2) are retained as long as the release
  exists, but releases can be deleted or moved between tags. Tier 3
  exists to make the archive immutable independent of release state.

## Verification

The retention strategy is exercised once per quarter via
`docs/dr-drill-checklist.md` — pick a random commit SHA from
≥1 year ago, run the restore procedure, and verify the cosign
signatures. Record the outcome under `docs/dr-drills/`.
