###############################################################################
# Cloudflare zone-level edge configuration for affilite-mix.
#
# Manages the Cloudflare zone settings, Bot Fight Mode, custom WAF rules,
# rate-limit rules, cache rules and Logpush job that complement the worker
# deployed via wrangler (see wrangler.jsonc).
#
# Targets cloudflare/cloudflare provider v5. v5 was a near-total rewrite
# generated from the Cloudflare API spec — most repeating blocks (`rules`,
# `action_parameters`, etc.) became typed attributes, and the
# `cloudflare_zone_settings_override` umbrella resource was replaced by a
# per-setting `cloudflare_zone_setting` resource.
#
# State backend is intentionally left unset — pick the team's preferred
# backend (e.g. `cloud { ... }` for Terraform Cloud, or an `s3 { ... }` /
# `gcs { ... }` block) before running `terraform init` for real.
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

# Logpush destination wiring.
#
# `logpush_destination_conf` carries the full Cloudflare destination
# string for the worker_logs Logpush job (see
# https://developers.cloudflare.com/logs/get-started/enable-destinations/).
# The default of `null` keeps the resource in a disabled state, which
# prevents `terraform apply` from being blocked when the destination
# credentials have not been provisioned yet. Once a real bucket/token
# pair exists, supply it via -var or a tfvars file and set
# `logpush_enabled = true`. The job stays opt-in to avoid silently
# shipping logs to a placeholder destination.
variable "logpush_destination_conf" {
  type        = string
  default     = null
  sensitive   = true
  description = <<-EOT
    Full Cloudflare Logpush destination string for the worker_logs job.
    Prefer R2 over S3 for the same-cloud, zero-egress path. Examples:
      r2://<account-id>/<bucket>?account-id=...&access-key-id=...&secret-access-key=...
      s3://<bucket>/<prefix>?region=<region>&access-key-id=...&secret-access-key=...
      datadog://api.datadoghq.com/api/v2/logs?header_DD-API-KEY=...&service=...
    Leave unset (null) to keep the Logpush resource disabled.
  EOT
}

variable "logpush_enabled" {
  type        = bool
  default     = true
  description = "Whether the worker_logs Logpush job should be enabled. Requires logpush_destination_conf to be set."
}

# WAF custom-rule offender lists.
#
# Replaces the previously hardcoded placeholder ASNs (`12345 / 54321`) that
# were never meant to ship to a real apply. ASN data must come from
# Cloudflare analytics (Security → Events → top offending ASNs) and is
# operationally sensitive, so it lives outside the codebase and is supplied
# via tfvars at apply time. The country list defaults to the OFAC-restricted
# set so a fresh apply still produces a meaningful rule even before the
# operator has triaged ASNs.
variable "waf_blocked_asns" {
  type        = list(number)
  default     = []
  description = <<-EOT
    ASNs to managed-challenge on the http_request_firewall_custom phase.
    Source from Cloudflare analytics offender data and supply via tfvars;
    the empty default scopes the rule to the country list only.
  EOT
}

variable "waf_blocked_countries" {
  type        = list(string)
  default     = ["KP", "IR", "SY"]
  description = <<-EOT
    ISO 3166-1 alpha-2 country codes to managed-challenge on the
    http_request_firewall_custom phase. Defaults to the OFAC-restricted
    set; supply via tfvars to extend or override.
  EOT
  validation {
    condition     = alltrue([for c in var.waf_blocked_countries : can(regex("^[A-Z]{2}$", c))])
    error_message = "waf_blocked_countries entries must be uppercase ISO 3166-1 alpha-2 codes (e.g. \"KP\")."
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

###############################################################################
# Zone settings
#
# Replaces the v4 `cloudflare_zone_settings_override` umbrella resource.
# Each setting is now its own resource, so plan/apply diffs are scoped and
# drift detection points at the exact knob that changed.
###############################################################################

resource "cloudflare_zone_setting" "always_use_https" {
  zone_id    = var.zone_id
  setting_id = "always_use_https"
  value      = "on"
}

resource "cloudflare_zone_setting" "min_tls_version" {
  zone_id    = var.zone_id
  setting_id = "min_tls_version"
  value      = "1.2"
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

# Bot Fight Mode — the free / Pro tier bot mitigation. Distinct from the
# paid `cloudflare_bot_management` resource (Super Bot Fight Mode), which
# requires a Bot Management entitlement on the zone.
resource "cloudflare_zone_setting" "bot_fight_mode" {
  zone_id    = var.zone_id
  setting_id = "bot_fight_mode"
  value      = "on"
}

# HSTS — was nested under `security_header { }` in the v4 override block.
# In v5 it's a top-level setting whose value is an object.
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

###############################################################################
# Rate-limit rule — protect /api/auth/*
#
# v5 ruleset schemas use `rules` as a typed list (square-bracketed object
# array) rather than repeated `rules { }` blocks, and nest action and
# rate-limit parameters under typed attributes.
###############################################################################

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
      characteristics     = ["ip.src", "cf.colo.id"]
      period              = 60
      requests_per_period = 20
      mitigation_timeout  = 300
    }
  }]
}

###############################################################################
# Custom WAF rules — challenge high-risk traffic on sensitive endpoints.
#
# The match expression is composed at plan time from `var.waf_blocked_asns`
# and `var.waf_blocked_countries`. Both lists are tfvar-driven so no
# placeholder offender data lives in source. The expression drops a clause
# entirely when its list is empty (Cloudflare rejects `in {}`); a
# precondition guarantees at least one clause is non-empty before apply.
###############################################################################

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
  description = "Challenge Tor/VPN traffic and high-risk ASNs from sensitive endpoints"
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  rules = [{
    action      = "managed_challenge"
    expression  = local.waf_expression
    description = "Challenge high-risk traffic"
    enabled     = true
  }]

  lifecycle {
    precondition {
      condition     = length(local.waf_clauses) > 0
      error_message = "waf_blocked_asns and waf_blocked_countries cannot both be empty — at least one match clause is required."
    }
  }
}

###############################################################################
# Cache rules — bypass cache for /api/*
###############################################################################

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

###############################################################################
# F-013 / LIVE-09: Logpush job — Workers trace events to long-term storage.
#
# Wiring:
#   * `var.logpush_destination_conf` — full Cloudflare destination URL.
#     See the variable declaration at the top of this file for the
#     supported schemes (R2, S3, Datadog, …) and an example string.
#     The recommended target is the R2 bucket declared in storage.tf
#     (`cloudflare_r2_bucket.worker_logs`); see the README for the
#     `r2://` URL template.
#   * `var.logpush_enabled` — kept off by default so a fresh
#     `terraform apply` doesn't silently start shipping logs.
#
# Operator runbook (LIVE-09 — close the SOC 2 log retention gap):
#   1. Upgrade the Cloudflare Workers plan to a tier that includes
#      Logpush (Workers Paid or higher).
#   2. Apply storage.tf so `cloudflare_r2_bucket.worker_logs` exists.
#   3. Mint an R2 access key pair scoped to that bucket
#      (Cloudflare dashboard → R2 → Manage R2 API tokens).
#   4. Set `logpush_destination_conf` (sensitive tfvar) to:
#        r2://<account-id>/<worker_logs_bucket_name>
#          ?account-id=<account-id>
#          &access-key-id=<...>
#          &secret-access-key=<...>
#   5. Flip `logpush_enabled = true` and run `terraform apply`.
#
# The resource stays count-1 even when disabled so its lifecycle is
# managed by Terraform regardless of whether the destination has been
# wired up yet — flipping `logpush_enabled = true` is then a one-line
# tfvars change instead of a code change. The previous placeholder
# string `s3://example-bucket/logs?region=us-east-1` was removed because
# it bypassed any review of where the data actually lands.
###############################################################################

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

###############################################################################
# Outputs — surface the IDs of the rulesets so other automation can attach
# additional rules to them later (e.g. a separate workspace adding per-route
# rate limits).
###############################################################################

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
