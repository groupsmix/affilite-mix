# Affiliate optimization loop

> **Authoritative API integration guide:** [Automation API integration guide](./automation-api.md).
> This page is the short cron/operator summary; the integration guide owns the
> complete API, policy, approval, error, and read-surface contract.

The daily, light-Worker affiliate optimization job runs at **10:00 UTC**, after EPC
recomputation (06:00) and affiliate link health (09:00). It reads 30-day
clicks, commissions, EPC, affiliate-link health, and content/product
associations, then submits at most five product actions through the automation
guardrail pipeline.

Products with at least 100 clicks for a network are eligible. A product/network
with at least 200 clicks and no commissions is proposed for archive. A
competitor that is at least 1.5x the current featured product's EPC is promoted
within the same content page; the prior featured product is demoted. When a
product has multiple active links, or its current destination is broken or
suspicious, a better alternate destination may be proposed.

`products.update` is policy-allowed and can execute automatically. Archive and
affiliate URL changes remain approval-required and are persisted as
`manual_attention`; they never execute in the scheduled loop. Deletes,
integrations, site changes, and user changes remain denied. Every action has a
deterministic idempotency key, a 14-day product/action cooldown, snapshots, and
an audit/run link.

The job requires an active site-bound automation service account with the
`products:update` scope. Sites without one are skipped. EPC data older than 48
hours is skipped. Retries replay existing actions rather than creating
duplicates. The loop uses EPC and clicks only: product impressions/views are
not available, so it has no conversion-rate rule.

Configure `CRON_AFFILIATE_OPTIMIZATION_SECRET` for the authenticated cron
route `/api/cron/affiliate-optimization`.
