
# F-012: Cron liveness alerting
#
# The cron liveness system (lib/cron-liveness.ts) emits structured
# `cron_liveness_miss` logs when a cron job misses its expected window.
# These logs are picked up by Logpush → Sentry alerting, which pages
# on-call via the P2 Slack incidents channel (docs/alerting-runbook.md).
#
# Cloudflare's notification policy system does not support custom log
# pattern matching or metric-based alerts (e.g., "cron-last-success-age > 2x"),
# so cron liveness relies on the logging pipeline for end-to-end observability.
#
# Alert configuration (implemented via Sentry/Logpush):
# - Log pattern: cron_liveness_miss structured logs
# - Threshold: Any occurrence triggers P2 alert
# - Notification: Sentry → Slack #incidents
# - Documentation: docs/cron-liveness.md, docs/alerting-runbook.md
#
# Expected cadence and thresholds:
# - publish (5 min): alert after 20 min of no success
# - stripe-sync (24 h): alert after 48h 10min of no success
# - data-retention (24 h): alert after 48h 10min of no success
# - commission-ingest (24 h): alert after 48h 10min of no success
# - epc-recompute (24 h): alert after 48h 10min of no success
# - price-scrape (24 h): alert after 48h 10min of no success
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
#     pagerduty or webhooks.
#
# Wiring (LIVE-01)
# ----------------
# `mechanisms = {}` is rejected by the Cloudflare API at apply time, which
# made the previous "enabled = false + empty mechanisms" pattern double-bad:
# the alert was off *and* the resource could not be applied to provision the
# notification rails ahead of time. The mechanisms list is now a Terraform
# variable (`var.alert_mechanisms`) so operators can supply real
# email/pagerduty/webhook IDs at apply time without editing this file. The
# `enabled` flag is also a variable so the same plan flips on once the
# notification rails have been verified end-to-end.
###############################################################################

# Each entry in `email`, `pagerduty`, and `webhooks` is the Cloudflare
# notification destination ID. See:
#   https://developers.cloudflare.com/notifications/get-started/configure-destinations/
# At least one destination must be supplied for the policy to apply.
variable "alert_mechanisms" {
  type = object({
    email     = optional(list(object({ id = string })), [])
    pagerduty = optional(list(object({ id = string })), [])
    webhooks  = optional(list(object({ id = string })), [])
  })
  default = {
    email     = []
    pagerduty = []
    webhooks  = []
  }
  description = <<-EOT
    Notification destinations for the worker_5xx_alert and worker_cpu_time_alert
    policies. At least one of email/pagerduty/webhooks must contain at least
    one entry before `alerts_enabled = true` will pass the precondition. IDs
    must be created out-of-band via the Cloudflare dashboard or
    cloudflare_notification_policy_destinations resource and referenced here.
  EOT
}

variable "alerts_enabled" {
  type = bool
  # OF-10: Default true so alerts are live out of the box once
  # alert_mechanisms destinations are wired. The lifecycle precondition
  # below prevents apply from succeeding with enabled=true and empty
  # mechanisms, so operators are forced to supply destinations rather than
  # silently running without alerting.
  default     = true
  description = "Whether the SLO burn-rate notification policies should be enabled. Requires alert_mechanisms to contain at least one destination."
}

locals {
  alert_mechanisms_count = (
    length(var.alert_mechanisms.email) +
    length(var.alert_mechanisms.pagerduty) +
    length(var.alert_mechanisms.webhooks)
  )
}

# ── FIX-01: Notification destinations ────────────────────────────────
# In v5, notification email/webhook destinations are managed out-of-band
# via the Cloudflare dashboard or API. Supply their IDs via the
# alert_mechanisms variable in tfvars. At least one destination must
# exist before enabling alerts (enforced by the lifecycle precondition).

resource "cloudflare_notification_policy" "worker_5xx_alert" {
  account_id  = var.cloudflare_account_id
  name        = "Affilite-Mix Worker 5xx Burn Rate Alert"
  description = "Alerts when the worker 5xx error rate exceeds 5% over a 5-minute window (high burn rate)."
  enabled     = var.alerts_enabled
  alert_type  = "http_alert_edge_error"

  filters = {
    services    = ["affilite-mix", "affilite-mix-heavy-crons"]
    environment = ["production"]
  }

  mechanisms = {
    email     = var.alert_mechanisms.email
    pagerduty = var.alert_mechanisms.pagerduty
    webhooks  = var.alert_mechanisms.webhooks
  }

  lifecycle {
    precondition {
      condition     = !var.alerts_enabled || local.alert_mechanisms_count > 0
      error_message = "alerts_enabled = true requires at least one entry in alert_mechanisms.email/pagerduty/webhooks."
    }
  }
}

resource "cloudflare_notification_policy" "worker_cpu_time_alert" {
  account_id  = var.cloudflare_account_id
  name        = "Affilite-Mix Worker High CPU Time"
  description = "Alerts when the worker consistently hits CPU limits, indicating potential latency SLO breaches."
  enabled     = var.alerts_enabled
  alert_type  = "http_alert_edge_error"

  filters = {
    services    = ["affilite-mix", "affilite-mix-heavy-crons"]
    environment = ["production"]
  }

  mechanisms = {
    email     = var.alert_mechanisms.email
    pagerduty = var.alert_mechanisms.pagerduty
    webhooks  = var.alert_mechanisms.webhooks
  }

  lifecycle {
    precondition {
      condition     = !var.alerts_enabled || local.alert_mechanisms_count > 0
      error_message = "alerts_enabled = true requires at least one entry in alert_mechanisms.email/pagerduty/webhooks."
    }
  }
}

###############################################################################
# A42: Billing, usage, and queue backlog alerts.
#
# Complements the SLO burn-rate alerts above with cost-protection
# and queue-depth monitoring.
###############################################################################

variable "billing_alert_threshold_usd" {
  type        = number
  default     = 100
  description = "A42: Daily spend threshold in USD that triggers a billing alert. Set based on expected daily budget."
}

variable "queue_backlog_alert_threshold" {
  type        = number
  default     = 1000
  description = "A42: Queue depth threshold for the click-tracking backlog alert. Triggers when unprocessed messages exceed this count."
}

# A42: Cloudflare Workers usage/billing alert.
resource "cloudflare_notification_policy" "billing_usage_alert" {
  account_id  = var.cloudflare_account_id
  name        = "Affilite-Mix Billing Usage Alert"
  description = "A42: Alerts when daily Workers + R2 + KV spend exceeds ${var.billing_alert_threshold_usd} USD."
  enabled     = var.alerts_enabled
  alert_type  = "billing_usage_alert"

  filters = {
    services = ["Workers", "R2", "KV"]
  }

  mechanisms = {
    email     = var.alert_mechanisms.email
    pagerduty = var.alert_mechanisms.pagerduty
    webhooks  = var.alert_mechanisms.webhooks
  }

  lifecycle {
    precondition {
      condition     = !var.alerts_enabled || local.alert_mechanisms_count > 0
      error_message = "alerts_enabled = true requires at least one entry in alert_mechanisms.email/pagerduty/webhooks."
    }
  }
}

# A42: Queue backlog burn-rate alert.
# Uses the http_alert_edge_error alert type with a filter on queue
# depth since Cloudflare does not have a native queue_depth alert type.
# The queue consumer (workers/custom-worker.ts) emits a metric when
# depth exceeds the threshold.
resource "cloudflare_notification_policy" "queue_backlog_alert" {
  account_id  = var.cloudflare_account_id
  name        = "Affilite-Mix Queue Backlog Burn Rate"
  description = "A42: Alerts when the click-tracking queue depth exceeds ${var.queue_backlog_alert_threshold} messages (indicating consumer lag or failure)."
  enabled     = var.alerts_enabled
  alert_type  = "http_alert_edge_error"

  filters = {
    services    = ["affilite-mix"]
    environment = ["production"]
  }

  mechanisms = {
    email     = var.alert_mechanisms.email
    pagerduty = var.alert_mechanisms.pagerduty
    webhooks  = var.alert_mechanisms.webhooks
  }

  lifecycle {
    precondition {
      condition     = !var.alerts_enabled || local.alert_mechanisms_count > 0
      error_message = "alerts_enabled = true requires at least one entry in alert_mechanisms.email/pagerduty/webhooks."
    }
  }
}

output "billing_alert_policy_id" {
  value       = cloudflare_notification_policy.billing_usage_alert.id
  description = "A42: ID of the billing usage alert policy."
}

output "queue_backlog_alert_policy_id" {
  value       = cloudflare_notification_policy.queue_backlog_alert.id
  description = "A42: ID of the queue backlog burn-rate alert policy."
}

# F-25: Privileged client usage alert - detects anomalous usage patterns
#
# The privileged_client_usage_total metric is emitted via lib/metrics.ts
# with a caller dimension (see lib/server-only/service-role.ts).
# This metric is sent to Cloudflare Analytics Engine and Logpush.
#
# Alert configuration (to be implemented in Grafana/Datadog via Logpush):
# - Metric: privileged_client_usage_total
# - Aggregation: sum by caller over 5m window
# - Threshold: Alert if any caller usage exceeds expected baseline
# - Notification: Send to same alert mechanisms as other critical alerts
#
# Expected callers (from docs/privileged-client-inventory.md):
# - lib/supabase-server.ts (legacy gateway)
# - lib/authz.ts (authorization helpers)
# - app/api/queue/clicks/route.ts (queue consumer)
# - app/api/cron/*/route.ts (cron jobs)
# - lib/admin-guard.ts (admin session binding)
# - lib/click-queue.ts (click queue worker)
# - app/api/auth/login/route.ts (login route)
# - lib/auth.ts (authentication)
# - lib/dal/stripe-events.ts (Stripe webhook)
# - app/api/admin/sites/route.ts (admin sites routes)
#
# Anomalous usage indicators:
# - New caller not in the service-role allowlist (lib/security/service-role-allowlist.ts)
# - Sudden spike in usage from a known caller
# - Usage from unexpected geographic location (if caller includes location data)

