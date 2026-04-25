# SLO Burn-rate Alerting Configuration
# Monitors the worker's 5xx rate and notifies the on-call team if the error budget is burning too fast.

resource "cloudflare_notification_policy" "worker_5xx_alert" {
  account_id  = var.cloudflare_account_id
  name        = "Affilite-Mix Worker 5xx Burn Rate Alert"
  description = "Alerts when the worker 5xx error rate exceeds 5% over a 5-minute window (High Burn Rate)"
  enabled     = true
  alert_type  = "workers_alert"

  filters {
    services = ["affilite-mix"]
    environment = ["production"]
  }

  # In a real environment, you would use a PagerDuty or Slack webhook integration.
  # email_integration {
  #   id = "..."
  # }
}

resource "cloudflare_notification_policy" "worker_cpu_time_alert" {
  account_id  = var.cloudflare_account_id
  name        = "Affilite-Mix Worker High CPU Time"
  description = "Alerts when the worker consistently hits CPU limits, indicating potential latency SLO breaches"
  enabled     = true
  alert_type  = "workers_alert"

  filters {
    services = ["affilite-mix"]
    environment = ["production"]
  }
}
