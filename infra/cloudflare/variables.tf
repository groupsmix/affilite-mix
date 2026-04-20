# ─── Authentication ────────────────────────────────────────────────────────────
variable "cloudflare_api_token" {
  description = "Cloudflare API token with Workers, KV, R2, DNS, and WAF permissions."
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID."
  type        = string
}

# ─── Zone ──────────────────────────────────────────────────────────────────────
variable "zone_id" {
  description = "Cloudflare zone ID for the primary domain."
  type        = string
}

variable "domain" {
  description = "Primary domain (e.g. wristnerd.xyz)."
  type        = string
  default     = "wristnerd.xyz"
}

# ─── Worker ────────────────────────────────────────────────────────────────────
variable "worker_name" {
  description = "Cloudflare Worker script name."
  type        = string
  default     = "affilite-mix"
}

# ─── Environment ──────────────────────────────────────────────────────────────
variable "environment" {
  description = "Deployment environment: production or staging."
  type        = string
  default     = "production"
  validation {
    condition     = contains(["production", "staging"], var.environment)
    error_message = "environment must be 'production' or 'staging'."
  }
}

# ─── Custom domains ──────────────────────────────────────────────────────────
variable "custom_domains" {
  description = "List of custom domains to route to the Worker (e.g. [\"arabictools.wristnerd.xyz\", \"crypto.wristnerd.xyz\"])."
  type        = list(string)
  default = [
    "wristnerd.xyz",
    "arabictools.wristnerd.xyz",
    "crypto.wristnerd.xyz",
  ]
}

# ─── WAF ──────────────────────────────────────────────────────────────────────
variable "waf_admin_rate_limit_rps" {
  description = "Requests per 10-second window before rate-limiting admin routes."
  type        = number
  default     = 30
}

variable "waf_api_rate_limit_rps" {
  description = "Requests per 10-second window before rate-limiting public API routes."
  type        = number
  default     = 100
}

variable "waf_newsletter_rate_limit_per_hour" {
  description = "Newsletter signup requests per IP per hour."
  type        = number
  default     = 3
}

variable "waf_click_track_rate_limit_per_min" {
  description = "Click-tracking requests per IP per minute."
  type        = number
  default     = 60
}
