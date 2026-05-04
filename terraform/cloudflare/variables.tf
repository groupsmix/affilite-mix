# A31: Terraform Variables for Cloudflare Infrastructure
# All variables with secure defaults and validation

# ═══════════════════════════════════════════════════════════════════════════════
# Cloudflare API Configuration
# ═══════════════════════════════════════════════════════════════════════════════

# A31#1: API token with documented required scopes
variable "cloudflare_api_token" {
  description = "Cloudflare API token with Zone:Edit, Account:Logs:Edit, Account:Bot Management:Edit, Zone:WAF:Edit scopes"
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

# ═══════════════════════════════════════════════════════════════════════════════
# Domain Configuration
# ═══════════════════════════════════════════════════════════════════════════════

variable "zone_domain" {
  description = "Primary domain for the zone (e.g., wristnerd.xyz)"
  type        = string
}

variable "worker_subdomain" {
  description = "Worker subdomain (e.g., affilite-mix for affilite-mix.workers.dev)"
  type        = string
  default     = "affilite-mix"
}

# ═══════════════════════════════════════════════════════════════════════════════
# Alerting Configuration
# A31#22: Alerts enabled by default
# ═══════════════════════════════════════════════════════════════════════════════

variable "alerts_enabled" {
  description = "Enable Cloudflare alerts (SLO burn-rate, CPU time, 5xx rate)"
  type        = bool
  default     = true  # Changed from false per A31#22
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

# ═══════════════════════════════════════════════════════════════════════════════
# Logpush Configuration
# A31#2, A31#3: Logpush enabled with r2:// validation
# ═══════════════════════════════════════════════════════════════════════════════

variable "logpush_enabled" {
  description = "Enable Cloudflare Logpush for Workers"
  type        = bool
  default     = true  # A31#3: Enabled by default for SOC2
}

variable "logpush_destination_conf" {
  description = "R2/S3 destination URI for Logpush (must be r2:// URI)"
  type        = string
  default     = ""
  
  # A31#2: Validation ensures r2:// URI format
  validation {
    condition     = var.logpush_destination_conf == "" || can(regex("^r2://", var.logpush_destination_conf))
    error_message = "logpush_destination_conf must be an r2:// URI for account-scoped security, or empty to disable."
  }
}

# ═══════════════════════════════════════════════════════════════════════════════
# WAF Configuration
# A31#4, A31#5: Extended country and ASN blocking
# ═══════════════════════════════════════════════════════════════════════════════

variable "waf_blocked_asns" {
  description = "List of ASNs to block at WAF level"
  type        = list(string)
  default     = []  # A31#4: Empty by default, operator populates
}

variable "waf_blocked_countries" {
  description = "Countries to challenge/block at WAF"
  type        = list(string)
  # A31#5: Extended beyond OFAC to include abuse hotspots
  default = ["KP", "IR", "SY", "CU", "RU", "BY"]
}

# ═══════════════════════════════════════════════════════════════════════════════
# Storage Configuration
# ═══════════════════════════════════════════════════════════════════════════════

variable "r2_default_location" {
  description = "Default R2 bucket location (WNAM, ENAM, WEU, EEU, APAC, or OC)"
  type        = string
  default     = "WNAM"  # A31#18: Single region default
}

# ═══════════════════════════════════════════════════════════════════════════════
# DR / Failover Configuration
# A31#14: Documented DR failover status
# ═══════════════════════════════════════════════════════════════════════════════

variable "dr_failover_enabled" {
  description = "Enable Cloudflare Pages static DR fallback (requires paid plan)"
  type        = bool
  default     = false  # A31#14: Disabled by default - requires paid plan
}

variable "dr_pages_project_name" {
  description = "Cloudflare Pages project name for DR fallback"
  type        = string
  default     = "affilite-mix-static-dr"
}

# ═══════════════════════════════════════════════════════════════════════════════
# Cost Controls
# A42#1: Billing anomaly alerts
# ═══════════════════════════════════════════════════════════════════════════════

variable "billing_alert_threshold_usd" {
  description = "Cloudflare billing alert threshold in USD"
  type        = number
  default     = 500  # A42#1: Alert on $500 monthly spend
}

# ═══════════════════════════════════════════════════════════════════════════════
# Worker Services
# A31#23-24: Monitor all worker services including heavy-crons
# ═══════════════════════════════════════════════════════════════════════════════

variable "worker_services" {
  description = "List of worker services to monitor"
  type        = list(string)
  default     = ["affilite-mix"]  # Extend with "affilite-mix-heavy-crons" if deployed
}

# ═══════════════════════════════════════════════════════════════════════════════
# Environment
# ═══════════════════════════════════════════════════════════════════════════════

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "prod"
}
