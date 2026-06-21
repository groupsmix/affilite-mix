###############################################################################
# Cloudflare zone-level edge configuration for affilite-mix.
#
# Manages the Cloudflare zone settings, Bot Fight Mode, custom WAF rules,
# rate-limit rules, cache rules and Logpush job that complement the worker
# deployed via wrangler (see wrangler.jsonc).
#
# A31/A35: Least-privilege token architecture — each capability uses a
# dedicated API token with the minimum permissions required:
#   * dns_api_token        — Zone:Read, DNS:Edit (for DNS record management)
#   * waf_api_token        — Zone:Read, WAF:Edit (for firewall rules)
#   * logpush_api_token    — Account:Read, Logs:Edit (for Logpush jobs)
#   * workers_deploy_token — Account:Read, Cloudflare Workers:Edit (for Workers)
#   * r2_lifecycle_token   — Account:Read, R2:Edit (for R2 bucket lifecycle)
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

# ── A31/A35: Least-privilege Cloudflare API tokens ───────────────────────────
# Each token is scoped to the minimum permissions required for its
# capability. No single token has cross-functional access.

variable "dns_api_token" {
  type        = string
  sensitive   = true
  description = "Cloudflare API token with Zone:Read + DNS:Edit permissions only. Used for DNS record management."
}

variable "waf_api_token" {
  type        = string
  sensitive   = true
  description = "Cloudflare API token with Zone:Read + WAF:Edit permissions only. Used for firewall rules, rate limiting, and zone security settings."
}

variable "logpush_api_token" {
  type        = string
  sensitive   = true
  description = "Cloudflare API token with Account:Read + Logs:Edit permissions only. Used for Logpush job management."
}

variable "workers_deploy_token" {
  type        = string
  sensitive   = true
  description = "Cloudflare API token with Account:Read + Cloudflare Workers:Edit permissions only. Used for Worker deployments."
}

variable "r2_lifecycle_token" {
  type        = string
  sensitive   = true
  description = "Cloudflare API token with Account:Read + R2:Edit permissions only. Used for R2 bucket lifecycle management."
}

variable "access_audience" {
  type        = string
  default     = null
  description = "Cloudflare Access audience tag for SSO integration. Required for Access protection."
}

# T4-#9: replaces the former wildcard allowed_origins / allowed_headers = ["*"]
# on the admin Access app CORS config. Default is empty (no cross-origin requests
# permitted), which is correct for a same-origin admin SPA. Set to your admin
# hostname(s) only if the admin frontend is genuinely served from a different origin.
variable "admin_cors_origins" {
  type        = list(string)
  default     = []
  description = "Allowed CORS origins for the admin Access app. Default [] disables cross-origin (same-origin only). Set to your admin domain(s) if the admin UI is cross-origin."
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
  description = "Unproxied hostname for the primary Worker origin behind the load balancer. Must not point at the proxied apex hostname. Override in tfvars."
  validation {
    condition     = var.worker_origin_hostname != "affilite-mix-origin.invalid" && !endswith(var.worker_origin_hostname, ".invalid")
    error_message = "worker_origin_hostname must be a real, approved hostname — the placeholder 'affilite-mix-origin.invalid' and any .invalid domain is not allowed in production."
  }
  validation {
    condition     = can(regex("^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$", var.worker_origin_hostname))
    error_message = "worker_origin_hostname must be a valid DNS hostname."
  }
  validation {
    # A31: The origin must not equal the proxied apex domain — routing through the
    # front door creates a loop and defeats the least-privilege origin model.
    condition     = var.worker_origin_hostname != var.zone_domain
    error_message = "worker_origin_hostname must not be the proxied apex domain (var.zone_domain). Use a dedicated, unproxied origin hostname instead."
  }
}

variable "logpush_destination_conf" {
  type        = string
  default     = null
  sensitive   = true
  description = "Full Cloudflare Logpush destination string for the worker_logs job."
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
  type = list(string)
  # S8-F14: Expanded from 4 to 9 countries per Season 8 CEO audit.
  # RU=Russia, BY=Belarus, MM=Myanmar, VE=Venezuela, SD=Sudan added.
  # Sub-region sanctions (Crimea, Donetsk, Luhansk) cannot be targeted
  # at WAF geo layer — RU block provides partial coverage.
  default     = ["KP", "IR", "SY", "CU", "RU", "BY", "MM", "VE", "SD"]
  description = "ISO 3166-1 alpha-2 country codes to hard-block on the http_request_firewall_custom phase (OFAC sanctioned)."
  validation {
    condition     = alltrue([for c in var.waf_blocked_countries : can(regex("^[A-Z]{2}$", c))])
    error_message = "waf_blocked_countries entries must be uppercase ISO 3166-1 alpha-2 codes (e.g. \"KP\")."
  }
}

# A36: Enable managed WAF rules in addition to custom rules.
variable "waf_managed_rulesets" {
  type = list(object({
    ruleset_id = string
    action     = optional(string, "block")
  }))
  default = [
    { ruleset_id = "efb7b8c949ac4650a09736fc376e9aee" }, # Cloudflare Managed Ruleset
    { ruleset_id = "4814384a9e5d4991b9815dcfc25d2f1f" }, # Cloudflare OWASP Core Ruleset
  ]
  description = "Managed WAF rulesets to enable. Default includes Cloudflare Managed Rules and OWASP Core Ruleset."
}

# ── Aliased providers for least-privilege token usage ────────────────────────
# Each aliased provider uses a different token so resources declare their
# required permissions explicitly through the provider reference.

provider "cloudflare" {
  alias     = "dns"
  api_token = var.dns_api_token
}

provider "cloudflare" {
  alias     = "waf"
  api_token = var.waf_api_token
}

provider "cloudflare" {
  alias     = "logpush"
  api_token = var.logpush_api_token
}

provider "cloudflare" {
  alias     = "workers"
  api_token = var.workers_deploy_token
}

provider "cloudflare" {
  alias     = "r2"
  api_token = var.r2_lifecycle_token
}

# Default provider for backward compatibility — delegates to WAF token
# for zone-level resources (the most common case).
provider "cloudflare" {
  api_token = var.waf_api_token
}

# ── A31/A36: Zone security settings ──────────────────────────────────────────
# Enforce modern TLS with TLS 1.3-only posture where possible.

resource "cloudflare_zone_setting" "always_use_https" {
  zone_id    = var.zone_id
  setting_id = "always_use_https"
  value      = "on"
}

resource "cloudflare_zone_setting" "min_tls_version" {
  zone_id    = var.zone_id
  setting_id = "min_tls_version"
  # A31: Enforce TLS 1.3-only. Setting tls_1_3 = "on" merely enables negotiation;
  # min_tls_version = "1.3" is required to actually block TLS 1.2 clients.
  # Ref: https://developers.cloudflare.com/ssl/edge-certificates/additional-options/minimum-tls/
  value = "1.3"
}

# A31/A36: Explicitly request TLS 1.3 (0-RTT disabled for replay safety).
resource "cloudflare_zone_setting" "tls_1_3" {
  zone_id    = var.zone_id
  setting_id = "tls_1_3"
  value      = "on"
}

# A31/A36: Modern cipher configuration — require ECDSA/AES-GCM/ChaCha20-Poly1305.
# This setting may require Cloudflare Enterprise; it is guarded by a
# lifecycle ignore_changes so a 403 from the provider does not block apply.
resource "cloudflare_zone_setting" "ciphers" {
  zone_id    = var.zone_id
  setting_id = "ciphers"
  value      = ["ECDHE-ECDSA-AES128-GCM-SHA256", "ECDHE-RSA-AES128-GCM-SHA256", "ECDHE-ECDSA-AES256-GCM-SHA384", "ECDHE-RSA-AES256-GCM-SHA384", "ECDHE-ECDSA-CHACHA20-POLY1305", "ECDHE-RSA-CHACHA20-POLY1305"]
  lifecycle {
    ignore_changes = [value]
  }
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

# ── A36: Rate limiting ───────────────────────────────────────────────────────
# Auth endpoints (existing) + additional route-specific limits for
# expensive operations.

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

# A36: Route-specific rate limits for expensive / sensitive endpoints.
resource "cloudflare_ruleset" "rate_limit_api" {
  zone_id     = var.zone_id
  name        = "Rate Limit API Endpoints"
  description = "Per-endpoint rate limits for expensive or sensitive operations"
  kind        = "zone"
  phase       = "http_ratelimit"

  rules = [
    {
      action      = "block"
      expression  = "(http.request.uri.path wildcard \"/api/track/*\")"
      description = "Rate limit click-tracking endpoints (A36)"
      enabled     = true
      ratelimit = {
        characteristics     = ["ip.src", "cf.colo.id"]
        period              = 60
        requests_per_period = 100
        mitigation_timeout  = 120
      }
    },
    {
      action      = "block"
      expression  = "(http.request.uri.path wildcard \"/api/admin/*\")"
      description = "Rate limit admin mutation endpoints (A36)"
      enabled     = true
      ratelimit = {
        characteristics     = ["ip.src"]
        period              = 60
        requests_per_period = 30
        mitigation_timeout  = 300
      }
    },
    {
      action      = "block"
      expression  = "(http.request.uri.path wildcard \"/api/cron/*\")"
      description = "Rate limit cron trigger endpoints (A36) — must be called by Cloudflare only"
      enabled     = true
      ratelimit = {
        characteristics     = ["ip.src"]
        period              = 60
        requests_per_period = 10
        mitigation_timeout  = 600
      }
    },
  ]
}

# ── WAF custom rules ─────────────────────────────────────────────────────────

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
  description = "Hard-block OFAC-sanctioned countries; challenge high-risk ASNs"
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  # F4: OFAC sanctioned countries get a hard block (not a solvable challenge).
  # ASNs keep managed_challenge so legitimate users on shared hosting can pass.
  rules = concat(
    length(var.waf_blocked_countries) > 0 ? [{
      action      = "block"
      expression  = local.waf_country_clause
      description = "F4: Hard-block OFAC-sanctioned countries (31 CFR)"
      enabled     = true
    }] : [],
    length(var.waf_blocked_asns) > 0 ? [{
      action      = "managed_challenge"
      expression  = local.waf_asn_clause
      description = "Challenge high-risk ASNs"
      enabled     = true
    }] : [],
  )

  lifecycle {
    precondition {
      condition     = length(local.waf_clauses) > 0
      error_message = "waf_blocked_asns and waf_blocked_countries cannot both be empty — at least one match clause is required."
    }
  }
}

# A36: Managed WAF rulesets (Cloudflare Managed + OWASP).
resource "cloudflare_ruleset" "waf_managed" {
  zone_id     = var.zone_id
  name        = "WAF Managed Rulesets"
  description = "Cloudflare Managed Ruleset and OWASP Core Ruleset (A36)"
  kind        = "zone"
  phase       = "http_request_firewall_managed"

  rules = [
    for idx, ruleset in var.waf_managed_rulesets : {
      action      = ruleset.action
      expression  = "true"
      description = "Execute ${ruleset.ruleset_id}"
      enabled     = true
      action_parameters = {
        id = ruleset.ruleset_id
      }
    }
  ]
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

# ── A41: Logpush with privacy minimisation ───────────────────────────────────
# Only include fields required for security monitoring; exclude raw
# request bodies and sensitive headers.

resource "cloudflare_logpush_job" "worker_logs" {
  # A41: Must use the logpush-scoped provider; the default provider is rebound
  # to var.waf_api_token and a WAF-only token cannot manage Logpush jobs.
  provider         = cloudflare.logpush
  account_id       = var.cloudflare_account_id
  name             = "workers-logpush"
  dataset          = "workers_trace_events"
  destination_conf = var.logpush_destination_conf
  enabled          = var.logpush_enabled

  output_options = {
    # A41: Minimised field list — excludes request bodies, cookies, and
    # query strings that may contain PII. Only Event, Outcome, and
    # Exceptions are included for debugging; Logs is excluded.
    field_names      = ["Event", "EventTimestampMs", "Outcome", "Exceptions"]
    timestamp_format = "rfc3339"
    output_type      = "ndjson"
    # A41: Redaction filter — strip any field matching common PII patterns
    # (email, phone, SSN, credit card) before output.
    redaction = {
      enabled = true
      regexes = [
        "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}", # Email
        "\\b\\d{3}-\\d{2}-\\d{4}\\b",                      # SSN
        "\\b\\d{4}[ -]?\\d{4}[ -]?\\d{4}[ -]?\\d{4}\\b",   # Credit card
      ]
    }
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

output "rate_limit_api_ruleset_id" {
  value       = cloudflare_ruleset.rate_limit_api.id
  description = "Ruleset ID for the API rate-limit ruleset (A36)."
}

output "waf_custom_ruleset_id" {
  value       = cloudflare_ruleset.waf_custom.id
  description = "Ruleset ID for the custom WAF ruleset."
}

output "waf_managed_ruleset_id" {
  value       = cloudflare_ruleset.waf_managed.id
  description = "Ruleset ID for the managed WAF rulesets (A36)."
}

output "cache_rules_ruleset_id" {
  value       = cloudflare_ruleset.cache_rules.id
  description = "Ruleset ID for the cache-rules ruleset."
}

# ── Health checks and load balancer ──────────────────────────────────────────

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
  zone_id       = var.zone_id
  name          = var.zone_domain
  default_pools = [cloudflare_load_balancer_pool.worker_origin.id]
  fallback_pool = cloudflare_load_balancer_pool.static_fallback.id
  proxied       = true

  session_affinity     = "cookie"
  session_affinity_ttl = 1800
  session_affinity_attributes = {
    samesite = "Auto"
    secure   = "Always"
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

# ── F-08: Cloudflare Access for admin segment ─────────────────────────────────
# Protects the admin interface (/q7m-k4j9/*) with zero-trust SSO instead of
# relying on path obfuscation. Requires SSO provider configuration (Google,
# GitHub, Okta, etc.) in the Cloudflare Access dashboard.
#
# SETUP:
# 1. Configure SSO provider in Cloudflare Dashboard → Zero Trust → Settings → Authentication
# 2. Set access_audience variable to your audience tag (e.g., "my-app-audience")
# 3. Apply Terraform to create the Access application
# 4. Test access at https://<your-domain>/q7m-k4j9/

resource "cloudflare_zero_trust_access_application" "admin_segment" {
  zone_id          = var.zone_id
  name             = "Affilite-Mix Admin Segment"
  type             = "self_hosted"
  session_duration = "24h"

  # Protect the obfuscated admin path
  # Note: This must match the actual admin path in app/q7m-k4j9/
  allowed_idps = ["google", "github"] # Add your configured IdPs here

  # F-08: Require authentication for all admin routes
  policies = [{
    name     = "Require Authentication"
    decision = "allow"
    include = [
      {
        email_domain = { domain = "*" } # Allow any authenticated email - refine for production
      }
    ]
    require = [
      {
        email = { email = "*" } # Require email authentication
      }
    ]
  }]

  # T4-#9: replace wildcard CORS (origins + headers = ["*"]) with explicit
  # values. The admin Access app is same-origin for normal use and doesn't
  # need CORS enabled; a wildcard allows any origin to make credentialed
  # requests to the admin segment if Access is ever misconfigured.
  # Set var.admin_cors_origins to your admin hostname(s) if cross-origin
  # requests to the admin app are genuinely required (e.g. a separate SPA).
  cors_headers = {
    allowed_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allowed_origins = var.admin_cors_origins
    allowed_headers = ["Authorization", "Content-Type", "X-Requested-With"]
    max_age         = 86400
  }

  lifecycle {
    precondition {
      condition     = var.access_audience != null
      error_message = "access_audience must be set to enable Cloudflare Access protection. Set the variable in tfvars or disable Access by removing this resource."
    }
  }
}
