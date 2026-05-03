# OF-10: Production alerting configuration.
#
# Mirrors terraform/cloudflare/alerts.tf for the infra/terraform root module.
# alerts_enabled defaults to true so production alerting is on by default.
# The precondition prevents apply when no destinations are configured.

variable "alerts_enabled" {
  type        = bool
  default     = true
  description = "Whether alerting policies should be enabled. Defaults to true for production safety. Requires at least one alert destination to be configured."
}

variable "alert_email_destinations" {
  type        = list(string)
  default     = []
  description = "Email addresses for alert notifications. At least one destination (email, PagerDuty, or Slack) must be configured when alerts_enabled = true."
}

variable "pagerduty_routing_key" {
  type        = string
  default     = ""
  sensitive   = true
  description = "PagerDuty routing key for alert escalation. Leave empty to skip PagerDuty integration."
}

variable "slack_webhook_secret_ref" {
  type        = string
  default     = ""
  description = "Cloudflare secret reference for the Slack webhook URL (e.g. cf://secrets/slack-alerts). Leave empty to skip Slack integration."
}

locals {
  alert_destinations_count = (
    length(var.alert_email_destinations) +
    (var.pagerduty_routing_key != "" ? 1 : 0) +
    (var.slack_webhook_secret_ref != "" ? 1 : 0)
  )
}

# Precondition: alerts_enabled = true requires at least one destination.
# This is checked at plan time so operators cannot accidentally deploy
# with alerting enabled but no notification rails.
resource "null_resource" "alert_destination_check" {
  count = var.alerts_enabled ? 1 : 0

  lifecycle {
    precondition {
      condition     = local.alert_destinations_count > 0
      error_message = "alerts_enabled = true requires at least one of: alert_email_destinations, pagerduty_routing_key, or slack_webhook_secret_ref."
    }
  }
}

output "alerts_status" {
  value = var.alerts_enabled ? "ENABLED (${local.alert_destinations_count} destination(s))" : "DISABLED"
  description = "Current alerting status and destination count."
}
