# ⚠️ DEPRECATED — Consolidated into `terraform/`

This directory previously held a second set of Terraform definitions that
overlapped with `terraform/cloudflare/` and `terraform/github/`.

**All IaC is now in `terraform/` (the canonical root):**

| Concern                                            | Canonical location                |
| -------------------------------------------------- | --------------------------------- |
| Cloudflare zone, WAF, DNS, TLS, R2, Queues, alerts | `terraform/cloudflare/`           |
| GitHub branch protection                           | `terraform/github/`               |
| Remote state (S3 backend)                          | `terraform/cloudflare/backend.tf` |

See `terraform/cloudflare/README.md` and `terraform/github/README.md` for
usage instructions.

## Why this was consolidated (audit finding F2)

Two Terraform trees defining overlapping resources (branch protection,
DNS records, alerts, WAF rules) meant that whichever tree was
`terraform apply`-ed last silently overwrote the other. This made it
impossible to know which configuration was actually live and introduced
a real risk of unapplied security controls (branch protection, WAF).

All unique resources from `infra/terraform/` (APAC health checks, OTEL
allowlist validation, R2 lifecycle rules, TLS 1.3 settings, OFAC WAF
blocks) were already present in the canonical `terraform/cloudflare/`
tree in their more complete form.
