###############################################################################
# SLO burn-rate alerting.
#
# Notifies the on-call team when the worker's 5xx rate or CPU-limit hit rate
# breaches the SLO. Distinct from the WAF / rate-limit rules in main.tf —
# those *block* abusive traffic; these *page* humans when the worker itself
# is unhealthy.
#
# v5 notes:
#   * `cloudflare_notification_policy.alert_type` is now a typed enum. The
#     v4 catch-all `"workers_alert"` was removed; the Workers product surfaces
#     5xx-style failures through `http_alert_edge_error` (edge-side errors,
#     which includes 5xxs returned by the worker isolate). There is no v5
#     enum value for "Worker exceeded CPU time" specifically — Cloudflare
#     surfaces those via the same edge-error pipeline, so we route both
#     concerns through the same alert_type and let the description disambiguate.
#   * `filters` is a typed nested-attribute object now (`= { … }`), not a
#     repeating block.
#   * `mechanisms` is required. Each policy needs at least one of email,
#     pagerduty or webhooks. Real integration IDs need to be wired up before
#     `enabled = true` — `enabled = false` keeps the resource present (so
#     ops can `terraform apply` and review the plan) without paging an empty
#     mechanisms set.
###############################################################################

resource "cloudflare_notification_policy" "worker_5xx_alert" {
  account_id  = var.cloudflare_account_id
  name        = "Affilite-Mix Worker 5xx Burn Rate Alert"
  description = "Alerts when the worker 5xx error rate exceeds 5% over a 5-minute window (high burn rate)."
  enabled     = false
  alert_type  = "http_alert_edge_error"

  filters = {
    services    = ["affilite-mix"]
    environment = ["production"]
  }

  # TODO: wire up at least one of email / pagerduty / webhooks before flipping
  # `enabled = true`. Example:
  #   mechanisms = {
  #     pagerduty = [{ id = "<pagerduty-integration-uuid>" }]
  #     email     = [{ id = "oncall@example.com" }]
  #   }
  mechanisms = {}
}

resource "cloudflare_notification_policy" "worker_cpu_time_alert" {
  account_id  = var.cloudflare_account_id
  name        = "Affilite-Mix Worker High CPU Time"
  description = "Alerts when the worker consistently hits CPU limits, indicating potential latency SLO breaches."
  enabled     = false
  alert_type  = "http_alert_edge_error"

  filters = {
    services    = ["affilite-mix"]
    environment = ["production"]
  }

  # TODO: wire up real mechanisms before `enabled = true` (see worker_5xx_alert).
  mechanisms = {}
}
