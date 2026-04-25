terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

variable "cloudflare_api_token" {
  type      = string
  sensitive = true
}

variable "cloudflare_account_id" {
  type = string
}

variable "zone_id" {
  type = string
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# Enable Bot Fight Mode
resource "cloudflare_bot_management" "bot_protection" {
  zone_id    = var.zone_id
  fight_mode = true
}

# Enforce HTTPS and HSTS
resource "cloudflare_zone_settings_override" "security_settings" {
  zone_id = var.zone_id
  settings {
    always_use_https = "on"
    min_tls_version  = "1.2"
    security_header {
      enabled            = true
      max_age            = 31536000
      include_subdomains = true
      preload            = true
      nosniff            = true
    }
    # WAF and Security Level
    security_level = "high"
    browser_check  = "on"
  }
}

# Rate Limiting Rule (Protect Login/Auth)
resource "cloudflare_ruleset" "rate_limit_auth" {
  zone_id     = var.zone_id
  name        = "Rate Limit Auth Endpoints"
  description = "Limit requests to /api/auth/*"
  kind        = "zone"
  phase       = "http_ratelimit"

  rules {
    action      = "block"
    expression  = "(http.request.uri.path wildcard \"/api/auth/*\")"
    description = "Rate limit auth endpoints"
    ratelimit {
      characteristics     = ["ip.src"]
      period              = 60
      requests_per_period = 20
      mitigation_timeout  = 300
    }
  }
}

# WAF Custom Rule to block high-risk countries or known bad ASNs
resource "cloudflare_ruleset" "waf_custom" {
  zone_id     = var.zone_id
  name        = "WAF Custom Block Rules"
  description = "Block Tor/VPN and high risk ASNs from sensitive endpoints"
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  rules {
    action      = "managed_challenge"
    expression  = "(ip.geoip.asnum in {12345 54321}) or (ip.geoip.country in {\"KP\" \"IR\" \"SY\"})"
    description = "Challenge high risk traffic"
  }
}

# Cache Rules
resource "cloudflare_ruleset" "cache_rules" {
  zone_id     = var.zone_id
  name        = "Cache Rules"
  description = "Bypass cache for /api/*"
  kind        = "zone"
  phase       = "http_request_cache_settings"

  rules {
    action     = "set_cache_settings"
    expression = "(http.request.uri.path wildcard \"/api/*\")"
    action_parameters {
      cache = false
    }
  }
}

variable "logpush_destination_conf" {
  type        = string
  description = "The destination configuration string for Cloudflare Logpush (e.g., s3://my-bucket/logs?region=us-east-1)"
  default     = "s3://placeholder-bucket/logs?region=us-east-1"
}

variable "logpush_enabled" {
  type        = bool
  description = "Whether the Logpush job is enabled"
  default     = false
}

# F-012: Logpush Job for long-term retention (shipping to S3/Datadog)
resource "cloudflare_logpush_job" "worker_logs" {
  account_id       = var.cloudflare_account_id
  name             = "workers-logpush"
  dataset          = "workers_trace_events"
  logpull_options  = "fields=Event,EventTimestampMs,Outcome,Logs,Exceptions&timestamps=rfc3339"
  destination_conf = var.logpush_destination_conf
  enabled          = var.logpush_enabled
}
