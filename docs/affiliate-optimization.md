# Affiliate optimization loop

The authoritative AI/operator documentation is the
[Automation API integration guide](./automation-api.md). See its
[cron section](./automation-api.md#7-cron-jobs-and-shared-state) for the
schedule and secret, and its [guardrail section](./automation-api.md#3-guardrail-model)
for policy outcomes.

The daily optimization cron runs at 10:00 UTC after EPC recomputation and
affiliate link health. It uses clicks/EPC and link health, submits no more than
five guarded product actions, skips stale EPC data, and requires an active
site-bound account with `products:update`. URL changes and archives wait in
`manual_attention`; allowed product metadata updates may execute automatically.
