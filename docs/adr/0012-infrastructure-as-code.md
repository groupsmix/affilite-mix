# ADR-0012: Infrastructure as Code (Terraform)

**Status**: Proposed
**Date**: 2026-05-26
**Context**: etap-6 A31-02 — no Terraform for Supabase/DNS resources

## Problem

Cloudflare Workers configuration lives in `wrangler.jsonc`, but Supabase
project settings, DNS records, and R2 lifecycle rules are managed via their
respective dashboards. Configuration drift between environments is possible.

## Current State

- Cloudflare Workers: `wrangler.jsonc` (declarative, version-controlled)
- Cloudflare DNS: dashboard-managed
- Supabase project: dashboard-managed
- R2 lifecycle rules: `r2-lifecycle.json` checked in, applied manually

## Proposed IaC Coverage

### Phase 1 — Cloudflare (30 days)

Use the [Cloudflare Terraform Provider](https://registry.terraform.io/providers/cloudflare/cloudflare/latest)
for resources that `wrangler.jsonc` doesn't manage:

- DNS records (A, CNAME, TXT for SPF/DKIM/DMARC)
- WAF rules
- R2 bucket lifecycle
- Page rules / redirect rules

### Phase 2 — Supabase (60 days)

Use the [Supabase Terraform Provider](https://registry.terraform.io/providers/supabase/supabase/latest)
for:

- Project settings (JWT secret rotation schedule, auth config)
- Database extensions
- Storage buckets

### Phase 3 — Full State (90 days)

- Remote state in Cloudflare R2 (or Terraform Cloud)
- `terraform plan` in CI as a PR check
- `terraform apply` gated by approval

## Decision

Adopt Phase 1 for DNS/WAF resources. Supabase Terraform deferred until the
provider stabilizes.

## Consequences

- DNS and WAF changes become PR-reviewable.
- Drift detection via `terraform plan` in CI.
- Team needs Terraform literacy (training budget required).
