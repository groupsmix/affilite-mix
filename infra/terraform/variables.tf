# A31#22: Terraform variables with secure defaults
# Variables marked with sensitive=true are encrypted in state

# ── Alerting Configuration ────────────────────────────────────────────────

variable "alerts_enabled" {
  description = "Enable Cloudflare alerts (SLO burn-rate, CPU time, 5xx rate)"
  type        = bool
  # A31#22: Changed default from false to true so alerts are active by default
  default     = true
}

variable "alert_email_destinations" {
  description = "Email addresses for alert notifications"
  type        = list(string)
  default     = []
}

variable "pagerduty_routing_key" {
  description = "PagerDuty integration key for critical alerts"
  type        = string
  sensitive   = true
  default     = ""
}

variable "slack_webhook_secret_ref" {
  description = "Cloudflare secret reference for Slack webhook URL"
  type        = string
  default     = ""
}

# ── Cloudflare API Configuration ─────────────────────────────────────────

variable "cloudflare_api_token" {
  description = "Cloudflare API token with Zone:Edit, Account:Logs:Edit scopes"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID"
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for the primary domain"
  type        = string
}

# ── WAF Configuration ─────────────────────────────────────────────────────

variable "waf_blocked_countries" {
  description = "List of country codes to block at WAF level"
  type        = list(string)
  # A31#5: Extended beyond OFAC list to include abuse hotspots
  default     = ["KP", "IR", "SY", "CU", "RU", "BY"]
}

variable "waf_blocked_asns" {
  description = "List of ASNs to block at WAF level"
  type        = list(string)
  default     = []
}

# ── Logpush Configuration ────────────────────────────────────────────────

variable "logpush_enabled" {
  description = "Enable Cloudflare Logpush for Workers"
  type        = bool
  # A31#3: Enable by default for SOC2 compliance
  default     = true
}

variable "logpush_destination_conf" {
  description = "R2/S3 destination URI for Logpush (must be r2:// URI)"
  type        = string
  # A31#2: Validation ensures r2:// URI format
  validation {
    condition     = can(regex("^r2://", var.logpush_destination_conf))
    error_message = "logpush_destination_conf must be an r2:// URI for account-scoped security."
  }
  default = ""
}

# ── DR / Failover Configuration ───────────────────────────────────────────

variable "dr_failover_enabled" {
  description = "Enable Cloudflare Pages static DR fallback (requires paid plan)"
  type        = bool
  # A31#14: Documented as requiring paid plan - default false until enabled
  default     = false
}

variable "dr_pages_project_name" {
  description = "Cloudflare Pages project name for DR fallback"
  type        = string
  default     = ""
}

# ── Cost Controls ───────────────────────────────────────────────────────────

variable "billing_alert_threshold_usd" {
  description = "Cloudflare billing alert threshold in USD"
  type        = number
  # A42#1: Alert on $500 monthly spend
  default     = 500
}
