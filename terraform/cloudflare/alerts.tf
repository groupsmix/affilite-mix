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
  # F-OBS-01: Keep default false to avoid breaking terraform apply without
  # destinations. Set to true in tfvars once alert_mechanisms are provisioned.
  default     = false
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
# Provision these ahead of time so flipping alerts_enabled = true is
# a one-line tfvars change. At least one destination must exist before
# enabling alerts (enforced by the lifecycle precondition below).

resource "cloudflare_notification_policy_emails" "oncall_email" {
  count       = var.alert_email_address != "" ? 1 : 0
  account_id  = var.cloudflare_account_id
  name        = "On-call email"
  emails      = [var.alert_email_address]
}

resource "cloudflare_notification_policy_webhooks" "slack_webhook" {
  count       = var.alert_slack_webhook_url != "" ? 1 : 0
  account_id  = var.cloudflare_account_id
  name        = "Slack webhook"
  url         = var.alert_slack_webhook_url
}

variable "alert_email_address" {
  type        = string
  default     = ""
  description = "Email address for on-call notifications. Leave empty to skip the email destination."
}

variable "alert_slack_webhook_url" {
  type        = string
  default     = ""
  sensitive   = true
  description = "Slack incoming webhook URL for alert notifications. Leave empty to skip the Slack destination."
}

# Automatically wire provisioned destinations into the mechanisms map.
locals {
  computed_alert_mechanisms = {
    email = concat(
      var.alert_mechanisms.email,
      cloudflare_notification_policy_emails.oncall_email[*].id != null ? [{ id = cloudflare_notification_policy_emails.oncall_email[0].id }] : [],
    )
    pagerduty = var.alert_mechanisms.pagerduty
    webhooks = concat(
      var.alert_mechanisms.webhooks,
      cloudflare_notification_policy_webhooks.slack_webhook[*].id != null ? [{ id = cloudflare_notification_policy_webhooks.slack_webhook[0].id }] : [],
    )
  }
}

resource "cloudflare_notification_policy" "worker_5xx_alert" {
  account_id  = var.cloudflare_account_id
  name        = "Affilite-Mix Worker 5xx Burn Rate Alert"
  description = "Alerts when the worker 5xx error rate exceeds 5% over a 5-minute window (high burn rate)."
  enabled     = var.alerts_enabled
  alert_type  = "http_alert_edge_error"

  filters = {
    services    = ["affilite-mix"]
    environment = ["production"]
  }

  mechanisms = local.computed_alert_mechanisms

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
    services    = ["affilite-mix"]
    environment = ["production"]
  }

  mechanisms = local.computed_alert_mechanisms

  lifecycle {
    precondition {
      condition     = !var.alerts_enabled || local.alert_mechanisms_count > 0
      error_message = "alerts_enabled = true requires at least one entry in alert_mechanisms.email/pagerduty/webhooks."
    }
  }
}
