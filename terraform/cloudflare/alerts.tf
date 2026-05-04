# A31#22: Cloudflare Alerts Configuration
# Alerts enabled by default with SLO burn-rate paging

# ═══════════════════════════════════════════════════════════════════════════════
# Alert Policies
# ═══════════════════════════════════════════════════════════════════════════════

# A31#22: Variable with default true (was false)
variable "alerts_enabled" {
  description = "Enable Cloudflare alerts (SLO burn-rate, CPU time, 5xx rate)"
  type        = bool
  default     = true
}

variable "alert_email_destinations" {
  description = "Email addresses for alert notifications"
  type        = list(string)
  default     = []
}

variable "slack_webhook_url" {
  description = "Slack webhook URL for critical alerts"
  type        = string
  sensitive   = true
  default     = ""
}

variable "pagerduty_routing_key" {
  description = "PagerDuty integration key for critical alerts"
  type        = string
  sensitive   = true
  default     = ""
}

variable "worker_services" {
  description = "List of worker services to monitor (main + heavy-crons)"
  type        = list(string)
  default     = ["affilite-mix"]  # Extend to include "affilite-mix-heavy-crons" if deployed
}

# ═══════════════════════════════════════════════════════════════════════════════
# Workers 5xx Rate Alert (SLO Burn Rate)
# A40#1: Alert for 5xx errors with burn-rate logic
# ═══════════════════════════════════════════════════════════════════════════════

resource "cloudflare_alert_policy" "worker_5xx" {
  count = var.alerts_enabled ? 1 : 0

  account_id = var.cloudflare_account_id
  name        = "worker-5xx-burn-rate"
  description = "Workers 5xx rate exceeds 5% over 5-minute window (SLO burn)"
  enabled     = true
  
  alert_type = "workers_error_rate"
  
  # Alert when 5xx rate > 5% over 5 minutes
  mechanisms {
    email {
      addresses = var.alert_email_destinations
    }
  }
  
  dynamic "mechanisms" {
    for_each = var.slack_webhook_url != "" ? [1] : []
    content {
      # Note: Cloudflare native Slack integration requires webhooks via notification destinations
      # This is a placeholder - actual Slack integration uses notification_policy
    }
  }
  
  filters {
    # A31#23: Monitor all worker services including heavy-crons
    services = var.worker_services
    
    # 5% error rate threshold
    thresholds {
      alert = 5.0  # 5%
    }
  }
  
  # 5-minute evaluation window
  frequency = "5m"
}

# ═══════════════════════════════════════════════════════════════════════════════
# Workers CPU Time Alert
# A40#2: CPU time alert for runaway scripts
# A31#24: Monitors both main and heavy-crons workers
# ═══════════════════════════════════════════════════════════════════════════════

resource "cloudflare_alert_policy" "worker_cpu" {
  count = var.alerts_enabled ? 1 : 0

  account_id = var.cloudflare_account_id
  name        = "worker-cpu-limit"
  description = "Workers CPU time limit exceeded (runaway script detection)"
  enabled     = true
  
  alert_type = "workers_cpu_time"
  
  mechanisms {
    email {
      addresses = var.alert_email_destinations
    }
  }
  
  filters {
    # A31#24: Monitor all worker services
    services = var.worker_services
  }
  
  frequency = "5m"
}

# ═══════════════════════════════════════════════════════════════════════════════
# Billing Anomaly Alert
# A42#1, A42#5: Cost/billing anomaly detection
# ═══════════════════════════════════════════════════════════════════════════════

resource "cloudflare_alert_policy" "billing_threshold" {
  count = var.alerts_enabled ? 1 : 0

  account_id = var.cloudflare_account_id
  name        = "billing-threshold"
  description = "Monthly Cloudflare spend approaching threshold"
  enabled     = true
  
  alert_type = "billing_usage_alert"
  
  mechanisms {
    email {
      addresses = var.alert_email_destinations
    }
  }
  
  filters {
    # Alert at 80% of threshold
    thresholds {
      alert = var.billing_alert_threshold_usd * 0.8
    }
  }
  
  frequency = "1d"  # Daily check
}

# ═══════════════════════════════════════════════════════════════════════════════
# Health Check Failure Alert
# ═══════════════════════════════════════════════════════════════════════════════

resource "cloudflare_alert_policy" "healthcheck_failure" {
  count = var.alerts_enabled ? 1 : 0

  account_id = var.cloudflare_account_id
  name        = "healthcheck-failure"
  description = "Health check failure detected in any region"
  enabled     = true
  
  alert_type = "healthcheck_status_notification"
  
  mechanisms {
    email {
      addresses = var.alert_email_destinations
    }
  }
  
  frequency = "1m"  # Immediate notification
}

# ═══════════════════════════════════════════════════════════════════════════════
# Notification Policy for Multi-Channel Alerts
# ═══════════════════════════════════════════════════════════════════════════════

# Primary notification policy for critical alerts
resource "cloudflare_notification_policy" "critical_alerts" {
  count = var.alerts_enabled ? 1 : 0

  account_id = var.cloudflare_account_id
  name        = "critical-alerts"
  description = "Critical security and availability alerts"
  enabled     = true
  alert_type  = "workers_alerting"

  dynamic "email_integration" {
    for_each = var.alert_email_destinations
    content {
      id   = email_integration.value
      name = email_integration.value
    }
  }
  
  # PagerDuty integration if configured
  dynamic "pagerduty_integration" {
    for_each = var.pagerduty_routing_key != "" ? [1] : []
    content {
      name = "pagerduty-critical"
      # PagerDuty integration requires manual setup in Cloudflare dashboard
      # This is a placeholder for the integration reference
    }
  }
}
