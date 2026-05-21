###############################################################################
# Cloudflare zone-level edge configuration for affilite-mix.
#
# Manages the Cloudflare zone settings, Bot Fight Mode, custom WAF rules,
# rate-limit rules, cache rules and Logpush job that complement the worker
# deployed via wrangler (see wrangler.jsonc).
###############################################################################

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

variable "cloudflare_api_token" {
  type        = string
  sensitive   = true
  description = "Cloudflare API token with Zone:Edit, Account:Logs:Edit, Account:Bot Management:Edit and Zone:WAF:Edit permissions."
}

variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare account ID that owns the zone (used for account-scoped resources like Logpush)."
}

variable "zone_id" {
  type        = string
  description = "Cloudflare zone ID for the production hostname."
}

variable "zone_domain" {
  type        = string
  description = "The primary domain for the zone (e.g. affilite-mix.com). Used for health checks and DR failover."
}

variable "worker_origin_hostname" {
  type        = string
  default     = "affilite-mix-origin.invalid"
  description = "Unproxied hostname for the primary Worker origin behind the load balancer. Must not point at the proxied apex hostname. Override in tfvars."
}

variable "logpush_destination_conf" {
  type        = string
  default     = null
  sensitive   = true
  description = "Full Cloudflare Logpush destination string for the worker_logs job. Must target the controlled R2 destination."

  validation {
    condition     = var.logpush_destination_conf == null || startswith(var.logpush_destination_conf, "r2://")
    error_message = "logpush_destination_conf must be null or an r2:// destination scoped to the controlled Cloudflare account."
  }
}

variable "logpush_enabled" {
  type        = bool
  default     = true
  description = "Whether the worker_logs Logpush job should be enabled. Requires logpush_destination_conf to be set."
}

variable "waf_blocked_asns" {
  type        = list(number)
  default     = []
  description = "ASNs to managed-challenge on the http_request_firewall_custom phase."
}

variable "waf_blocked_countries" {
  type        = list(string)
  default     = ["CU", "IR", "KP", "SY"]
  description = "ISO 3166-1 alpha-2 country codes to block on the http_request_firewall_custom phase for sanctions/export-control enforcement."
  validation {
    condition     = alltrue([for c in var.waf_blocked_countries : can(regex("^[A-Z]{2}$", c))])
    error_message = "waf_blocked_countries entries must be uppercase ISO 3166-1 alpha-2 codes (e.g. \"KP\")."
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

resource "cloudflare_zone_setting" "always_use_https" {
  zone_id    = var.zone_id
  setting_id = "always_use_https"
  value      = "on"
}

resource "cloudflare_zone_setting" "min_tls_version" {
  zone_id    = var.zone_id
  setting_id = "min_tls_version"
  value      = "1.3"
}

resource "cloudflare_zone_setting" "security_level" {
  zone_id    = var.zone_id
  setting_id = "security_level"
  value      = "high"
}

resource "cloudflare_zone_setting" "browser_check" {
  zone_id    = var.zone_id
  setting_id = "browser_check"
  value      = "on"
}

resource "cloudflare_zone_setting" "bot_fight_mode" {
  zone_id    = var.zone_id
  setting_id = "bot_fight_mode"
  value      = "on"
}

resource "cloudflare_zone_setting" "security_header" {
  zone_id    = var.zone_id
  setting_id = "security_header"

  value = {
    strict_transport_security = {
      enabled            = true
      max_age            = 63072000
      include_subdomains = true
      preload            = true
      nosniff            = true
    }
  }
}

resource "cloudflare_ruleset" "rate_limit_auth" {
  zone_id     = var.zone_id
  name        = "Rate Limit Auth Endpoints"
  description = "Limit requests to /api/auth/*"
  kind        = "zone"
  phase       = "http_ratelimit"

  rules = [{
    action      = "block"
    expression  = "(http.request.uri.path wildcard \"/api/auth/*\")"
    description = "Rate limit auth endpoints"
    enabled     = true

    ratelimit = {
      characteristics     = ["ip.src"]
      period              = 60
      requests_per_period = 20
      mitigation_timeout  = 300
    }
  }]
}

locals {
  waf_asn_clause = length(var.waf_blocked_asns) > 0 ? format(
    "(ip.geoip.asnum in {%s})",
    join(" ", [for a in var.waf_blocked_asns : tostring(a)]),
  ) : ""

  waf_country_clause = length(var.waf_blocked_countries) > 0 ? format(
    "(ip.geoip.country in {%s})",
    join(" ", [for c in var.waf_blocked_countries : "\"${c}\""]),
  ) : ""

  waf_clauses    = compact([local.waf_asn_clause, local.waf_country_clause])
  waf_expression = join(" or ", local.waf_clauses)
}

resource "cloudflare_ruleset" "waf_custom" {
  zone_id     = var.zone_id
  name        = "WAF Custom Block Rules"
  description = "Block sanctioned countries and non-standard ports; challenge high-risk ASNs"
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  rules = concat(
    [
      {
        action      = "block"
        expression  = "(cf.edge.server_port in {22 8080 9000})"
        description = "Block non-standard public ports detected by ASM"
        enabled     = true
      },
    ],
    local.waf_country_clause == "" ? [] : [
      {
        action      = "block"
        expression  = local.waf_country_clause
        description = "Block sanctioned-country traffic"
        enabled     = true
      },
    ],
    local.waf_asn_clause == "" ? [] : [
      {
        action      = "managed_challenge"
        expression  = local.waf_asn_clause
        description = "Challenge high-risk ASN traffic"
        enabled     = true
      },
    ],
  )

  lifecycle {
    precondition {
      condition     = length(local.waf_clauses) > 0
      error_message = "waf_blocked_asns and waf_blocked_countries cannot both be empty — at least one match clause is required."
    }
  }
}

resource "cloudflare_ruleset" "cache_rules" {
  zone_id     = var.zone_id
  name        = "Cache Rules"
  description = "Bypass cache for /api/*"
  kind        = "zone"
  phase       = "http_request_cache_settings"

  rules = [{
    action      = "set_cache_settings"
    expression  = "(http.request.uri.path wildcard \"/api/*\")"
    description = "Bypass cache on API routes"
    enabled     = true

    action_parameters = {
      cache = false
    }
  }]
}

resource "cloudflare_logpush_job" "worker_logs" {
  account_id       = var.cloudflare_account_id
  name             = "workers-logpush"
  dataset          = "workers_trace_events"
  destination_conf = var.logpush_destination_conf
  enabled          = var.logpush_enabled

  output_options = {
    field_names      = ["Event", "EventTimestampMs", "Outcome", "Logs", "Exceptions"]
    timestamp_format = "rfc3339"
    output_type      = "ndjson"
  }

  lifecycle {
    precondition {
      condition     = !var.logpush_enabled || var.logpush_destination_conf != null
      error_message = "logpush_enabled = true requires logpush_destination_conf to be set."
    }
  }
}

output "rate_limit_auth_ruleset_id" {
  value       = cloudflare_ruleset.rate_limit_auth.id
  description = "Ruleset ID for the auth rate-limit ruleset."
}

output "waf_custom_ruleset_id" {
  value       = cloudflare_ruleset.waf_custom.id
  description = "Ruleset ID for the custom WAF ruleset."
}

output "cache_rules_ruleset_id" {
  value       = cloudflare_ruleset.cache_rules.id
  description = "Ruleset ID for the cache-rules ruleset."
}

resource "cloudflare_healthcheck" "worker_origin" {
  zone_id = var.zone_id
  name    = "worker-origin-health"
  address = var.zone_domain

  http_config = {
    method           = "GET"
    path             = "/api/health"
    expected_codes   = ["200"]
    follow_redirects = false
    port             = 443
    header = {
      Host = [var.zone_domain]
    }
  }

  check_regions = ["WEU", "WNAM"]
  interval      = 60
  retries       = 2
  timeout       = 10
}

resource "cloudflare_load_balancer" "dr_failover" {
  zone_id        = var.zone_id
  name           = var.zone_domain
  default_pools  = [cloudflare_load_balancer_pool.worker_origin.id]
  fallback_pool  = cloudflare_load_balancer_pool.static_fallback.id
  proxied        = true

  session_affinity     = "cookie"
  session_affinity_ttl = 1800
  session_affinity_attributes = {
    samesite = "Auto"
    secure   = true
  }
}

resource "cloudflare_load_balancer_pool" "worker_origin" {
  account_id = var.cloudflare_account_id
  name       = "worker-origin-pool"
  origins = [{
    name    = "worker-origin"
    address = var.worker_origin_hostname
    enabled = true
  }]
  monitor = cloudflare_healthcheck.worker_origin.id
}

resource "cloudflare_load_balancer_pool" "static_fallback" {
  account_id = var.cloudflare_account_id
  name       = "static-fallback-pool"
  origins = [{
    name    = "static-unavailable"
    address = "affilite-mix-unavailable.pages.dev"
    enabled = true
  }]
}
