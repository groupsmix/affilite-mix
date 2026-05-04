# A31: Cloudflare Infrastructure Configuration
# Hostile-everything audit fixes applied

terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }

  # A31#1: Remote state backend - operator must configure before init
  # backend "s3" { ... }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# ═══════════════════════════════════════════════════════════════════════════════
# Variables (see variables.tf for declarations)
# ═══════════════════════════════════════════════════════════════════════════════

# A31#2: Logpush destination with validation for r2:// URI
variable "logpush_destination_conf" {
  description = "R2 destination for Worker logs (must be r2:// URI)"
  type        = string
  validation {
    condition     = can(regex("^r2://", var.logpush_destination_conf))
    error_message = "logpush_destination_conf must be an r2:// URI for account-scoped security."
  }
}

# A31#3: Logpush enabled by default (was false)
variable "logpush_enabled" {
  description = "Enable Cloudflare Logpush for Workers"
  type        = bool
  default     = true
}

# A31#4: WAF blocked ASNs (default empty, can be overridden)
variable "waf_blocked_asns" {
  description = "List of ASNs to block at WAF level"
  type        = list(string)
  default     = []
}

# A31#5: Extended WAF blocked countries beyond OFAC
variable "waf_blocked_countries" {
  description = "Countries to challenge/block at WAF"
  type        = list(string)
  # Extended beyond OFAC to include abuse hotspots (Brazil removed - too broad, kept targeted)
  default = ["KP", "IR", "SY", "CU", "RU", "BY"]
}

# ═══════════════════════════════════════════════════════════════════════════════
# TLS & Security Settings
# ═══════════════════════════════════════════════════════════════════════════════

# A31#6: TLS 1.3 enforcement (was 1.2)
resource "cloudflare_zone_settings_override" "tls" {
  zone_id = var.cloudflare_zone_id
  settings {
    min_tls_version          = "1.3"  # Changed from 1.2
    tls_1_3                  = "on"
    automatic_https_rewrites = "on"
    always_use_https         = "on"
    security_level           = "high"
    # A31#7: Browser Integrity Check
    browser_check = "on"
    # Bot Fight Mode
    bot_fight_mode = "on"
  }
}

# HSTS Configuration
resource "cloudflare_zone_settings_override" "hsts" {
  zone_id = var.cloudflare_zone_id
  settings {
    security_header {
      enabled            = true
      max_age            = 63072000  # 2 years
      include_subdomains = true
      preload            = true
      nosniff            = true
    }
  }
}

# ═══════════════════════════════════════════════════════════════════════════════
# Rate Limiting
# ═══════════════════════════════════════════════════════════════════════════════

# A31#8: Auth rate limit WITHOUT cf.colo.id (was causing colo multiplication)
# A31#9: Defense-in-depth - edge rate limit complements app-level limits
resource "cloudflare_ruleset" "auth_rate_limit" {
  zone_id = var.cloudflare_zone_id
  name    = "auth-rate-limit"
  kind    = "zone"
  phase   = "http_request_ratelimit"

  rules {
    action      = "block"  # Hard block, not managed_challenge
    expression  = "(http.request.uri.path matches \"/api/auth/*\")"
    description = "Auth endpoint rate limiting"
    enabled     = true

    ratelimit {
      # A31#8: REMOVED cf.colo.id - now uses ip.src only
      characteristics = ["ip.src"]
      period            = 60
      requests_per_period = 20
      mitigation_timeout  = 300
      # A31#9: No per-email bucket at edge (handled in app code)
      # This is defense-in-depth; primary auth limits in login route
    }
  }
}

# Global IP rate limit for all API endpoints (defense in depth)
resource "cloudflare_ruleset" "global_api_rate_limit" {
  zone_id = var.cloudflare_zone_id
  name    = "global-api-rate-limit"
  kind    = "zone"
  phase   = "http_request_ratelimit"

  rules {
    action      = "block"
    expression  = "(http.request.uri.path matches \"/api/*\")"
    description = "Global API rate limiting"
    enabled     = true

    ratelimit {
      characteristics   = ["ip.src"]
      period            = 60
      requests_per_period = 120  # 2/second average
      mitigation_timeout  = 600
    }
  }
}

# ═══════════════════════════════════════════════════════════════════════════════
# WAF Custom Rules
# ═══════════════════════════════════════════════════════════════════════════════

# A31#10: OFAC compliance - BLOCK action (not managed_challenge)
resource "cloudflare_ruleset" "ofac_block" {
  zone_id = var.cloudflare_zone_id
  name    = "ofac-hard-block"
  kind    = "zone"
  phase   = "http_request_firewall_custom"

  rules {
    action      = "block"  # Changed from managed_challenge to block
    expression  = "(ip.geoip.country in {${join(" ", var.waf_blocked_countries)}})"
    description = "OFAC sanctioned countries - hard block"
    enabled     = true
  }
}

# ASN-based blocking (if configured)
resource "cloudflare_ruleset" "asn_block" {
  count = length(var.waf_blocked_asns) > 0 ? 1 : 0

  zone_id = var.cloudflare_zone_id
  name    = "asn-block"
  kind    = "zone"
  phase   = "http_request_firewall_custom"

  rules {
    action      = "block"
    expression  = "(ip.src.asnum in {${join(" ", var.waf_blocked_asns)}})"
    description = "ASN-based blocking"
    enabled     = true
  }
}

# ═══════════════════════════════════════════════════════════════════════════════
# Caching
# ═══════════════════════════════════════════════════════════════════════════════

# A31#11: Static asset caching with immutable headers
resource "cloudflare_ruleset" "static_cache" {
  zone_id = var.cloudflare_zone_id
  name    = "static-cache-rules"
  kind    = "zone"
  phase   = "http_request_cache_settings"

  rules {
    action = "set_cache_settings"
    action_parameters {
      cache = true
      cache_key {
        custom_key {
          query_string {
            exclude = ["*"]  # Ignore query strings for static assets
          }
        }
      }
      edge_ttl {
        mode    = "override_origin"
        default = 31536000  # 1 year
      }
      browser_ttl {
        mode    = "override_origin"
        default = 31536000
      }
    }
    expression  = "(http.request.uri.path matches \"^/_next/static/*\") or (http.request.uri.path matches \"\\.(js|css|png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|otf)$\")"
    description = "Static assets - immutable cache"
    enabled     = true
  }

  # API routes bypass cache
  rules {
    action      = "set_cache_settings"
    expression  = "(http.request.uri.path matches \"/api/*\")"
    description = "API routes - bypass cache"
    enabled     = true
  }
}

# ═══════════════════════════════════════════════════════════════════════════════
# Logpush Configuration
# ═══════════════════════════════════════════════════════════════════════════════

# A31#12: Extended Logpush with RequestHeaders and ResponseHeaders for IR
resource "cloudflare_logpush_job" "worker_logs" {
  count = var.logpush_enabled ? 1 : 0

  zone_id              = var.cloudflare_zone_id
  dataset              = "workers_trace_events"
  destination_conf     = var.logpush_destination_conf
  name                 = "worker-logs"
  enabled              = true
  
  # A31#12: Extended field set for forensic IR
  # Includes RequestHeaders and ResponseHeaders for complete request tracing
  output_options {
    field_names = [
      "Event",
      "EventTimestampMs",
      "Outcome",
      "Logs",
      "Exceptions",
      "RequestHeaders",      # Added for IR
      "ResponseHeaders",     # Added for IR
      "ScriptName",          # Added for route attribution
      "URL",                 # Added for request tracing
      "Method",              # Added for request tracing
      "Status",              # Added for response tracing
    ]
    timestamp_format = "rfc3339"
  }
}

# ═══════════════════════════════════════════════════════════════════════════════
# Health Checks
# ═══════════════════════════════════════════════════════════════════════════════

# A31#13: Extended healthcheck regions to include APAC
resource "cloudflare_healthcheck" "primary" {
  zone_id  = var.cloudflare_zone_id
  name     = "primary-healthcheck"
  type     = "HTTPS"
  port     = 443
  method   = "GET"
  path     = "/api/health"
  
  # Extended regions beyond WEU/WNAM
  regions = ["WEU", "WNAM", "EEU", "ENAM", "APAC", "OC"]  # Added APAC + Oceania
  
  timeout       = 10
  retries       = 3
  interval      = 60
  expected_codes = "200"
  
  notification {
    suspended = false
    email_addresses = var.alert_email_destinations
  }
}

# ═══════════════════════════════════════════════════════════════════════════════
# DR / Failover
# ═══════════════════════════════════════════════════════════════════════════════

# A31#14: DR Failover Load Balancer (documented as requiring paid plan)
# This is currently disabled by default until the paid plan is available
resource "cloudflare_load_balancer" "primary" {
  count = var.dr_failover_enabled ? 1 : 0

  zone_id          = var.cloudflare_zone_id
  name             = "dr-failover"
  fallback_pool_id = cloudflare_load_balancer_pool.fallback[0].id
  default_pool_ids = [cloudflare_load_balancer_pool.primary[0].id]
  description      = "Primary worker with Pages static DR fallback"
  enabled          = true
  
  # Steering policy: failover on health check failure
  steering_policy = "off"
  
  # 5xx failover trigger
  session_affinity = "none"
}

resource "cloudflare_load_balancer_pool" "primary" {
  count = var.dr_failover_enabled ? 1 : 0

  name = "primary-worker"
  
  origins {
    name    = "primary"
    address = "${var.worker_subdomain}.workers.dev"
    enabled = true
    weight  = 100
  }
  
  healthcheck {
    type     = "HTTPS"
    port     = 443
    method   = "GET"
    path     = "/api/health"
    interval = 60
    timeout  = 10
    retries  = 3
  }
}

resource "cloudflare_load_balancer_pool" "fallback" {
  count = var.dr_failover_enabled ? 1 : 0

  name = "static-dr-fallback"
  
  origins {
    name    = "pages-fallback"
    address = "${var.dr_pages_project_name}.pages.dev"
    enabled = true
    weight  = 100
  }
  
  # Static fallback has simpler health check
  healthcheck {
    type     = "HTTPS"
    port     = 443
    method   = "GET"
    path     = "/"
    interval = 300  # Less frequent for static
    timeout  = 10
    retries  = 2
  }
}

# ═══════════════════════════════════════════════════════════════════════════════
# Resource Tagging
# ═══════════════════════════════════════════════════════════════════════════════

# A31#25: Tag resources for cost attribution and ownership
# Note: Cloudflare provider has limited tagging support; using comments/documentation
locals {
  common_tags = {
    environment = "production"
    project     = "affilite-mix"
    owner       = "platform-team"
    cost_center = "infrastructure"
    managed_by  = "terraform"
  }
}
