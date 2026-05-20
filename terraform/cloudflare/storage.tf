###############################################################################
# Storage bindings — KV namespaces and R2 buckets.
#
# These resources back the worker bindings declared in wrangler.jsonc:
#
#   kv_namespaces[].binding   IaC resource (this file)
#   ─────────────────────     ─────────────────────────────
#   RATE_LIMIT_KV             cloudflare_workers_kv_namespace.rate_limit_kv
#   APP_CACHE_KV              cloudflare_workers_kv_namespace.app_cache_kv
#
#   r2_buckets[].binding      IaC resource
#   ─────────────────────     ─────────────────────────────
#   NEXT_INC_CACHE_R2_BUCKET  cloudflare_r2_bucket.next_inc_cache
#
# Additional non-binding R2 bucket:
#
#   bucket name               IaC resource                          purpose
#   ─────────────────────     ──────────────────────────────────    ───────────
#   workers-logpush-<env>     cloudflare_r2_bucket.worker_logs      LIVE-09:
#                                                                   Logpush
#                                                                   destination
#                                                                   for the
#                                                                   workers_trace_events
#                                                                   dataset.
#
# Ownership boundary: Terraform owns the namespace/bucket resources and their
# IDs. wrangler.jsonc references those IDs at deploy time via
# `${RATE_LIMIT_KV_NAMESPACE_ID}` / `${APP_CACHE_KV_NAMESPACE_ID}` (see
# docs/CLOUDFLARE.md → "Wrangler deploy-time variables"). The R2 bucket is
# referenced by name, so the wrangler binding stays unchanged after import.
#
# Importing existing resources (one-time):
#
#   terraform import cloudflare_workers_kv_namespace.rate_limit_kv \
#     "${var.cloudflare_account_id}/<namespace-id>"
#   terraform import cloudflare_workers_kv_namespace.app_cache_kv \
#     "${var.cloudflare_account_id}/<namespace-id>"
#   terraform import cloudflare_r2_bucket.next_inc_cache \
#     "${var.cloudflare_account_id}/next-inc-cache"
#   terraform import cloudflare_r2_bucket.worker_logs \
#     "${var.cloudflare_account_id}/<worker-logs-bucket-name>"
#
# Run `npx wrangler kv namespace list` and `npx wrangler r2 bucket list` to
# discover the IDs/names currently in use before importing.
###############################################################################

variable "r2_default_location" {
  type        = string
  description = "R2 bucket location hint (jurisdiction). Common values: WNAM, ENAM, WEUR, EEUR, APAC, OC. See https://developers.cloudflare.com/r2/buckets/data-location/."
  default     = "WNAM"
}

resource "cloudflare_workers_kv_namespace" "rate_limit_kv" {
  account_id = var.cloudflare_account_id
  title      = "RATE_LIMIT_KV"
}

resource "cloudflare_workers_kv_namespace" "app_cache_kv" {
  account_id = var.cloudflare_account_id
  title      = "APP_CACHE_KV"
}

resource "cloudflare_r2_bucket" "next_inc_cache" {
  account_id = var.cloudflare_account_id
  name       = "next-inc-cache"
  location   = var.r2_default_location
}

# LIVE-09: dedicated R2 bucket that receives workers_trace_events from the
# Logpush job declared in main.tf. Kept separate from `next_inc_cache` so log
# retention / lifecycle / access controls can be tuned independently of the
# OpenNext incremental cache.
#
# Bucket creation does NOT require a paid Cloudflare Workers plan, but
# Logpush itself does (see docs/CLOUDFLARE.md → "Logpush"). Importing or
# applying this resource on a free-tier account is therefore safe; flipping
# `var.logpush_enabled = true` is the step that requires the upgrade.
variable "worker_logs_bucket_name" {
  type        = string
  default     = "workers-logpush"
  description = "R2 bucket name that receives Cloudflare Logpush deliveries for the workers_trace_events dataset. Override per environment if multi-env tenants share the same account."
}

resource "cloudflare_r2_bucket" "worker_logs" {
  account_id = var.cloudflare_account_id
  name       = var.worker_logs_bucket_name
  location   = var.r2_default_location
}

###############################################################################
# Outputs — surface IDs so the deploy pipeline can pass them to wrangler via
# the documented `${RATE_LIMIT_KV_NAMESPACE_ID}` / `${APP_CACHE_KV_NAMESPACE_ID}`
# environment variables.
###############################################################################

output "rate_limit_kv_namespace_id" {
  value       = cloudflare_workers_kv_namespace.rate_limit_kv.id
  description = "ID of the RATE_LIMIT_KV namespace. Export as RATE_LIMIT_KV_NAMESPACE_ID before `wrangler deploy`."
}

output "app_cache_kv_namespace_id" {
  value       = cloudflare_workers_kv_namespace.app_cache_kv.id
  description = "ID of the APP_CACHE_KV namespace. Export as APP_CACHE_KV_NAMESPACE_ID before `wrangler deploy`."
}

output "next_inc_cache_bucket_name" {
  value       = cloudflare_r2_bucket.next_inc_cache.name
  description = "Name of the R2 bucket bound to NEXT_INC_CACHE_R2_BUCKET in wrangler.jsonc."
}

output "worker_logs_bucket_name" {
  value       = cloudflare_r2_bucket.worker_logs.name
  description = "Name of the R2 bucket that receives the workers_trace_events Logpush job (LIVE-09). Wire this into `logpush_destination_conf` after generating R2 access keys."
}

###############################################################################
# OF-11: R2 lifecycle rules, object-lock (WORM), and replication stubs.
#
# Cloudflare R2 does not yet expose lifecycle / object-lock / replication
# via the Terraform provider (as of provider v4/v5). The rules below use
# lifecycle meta-argument blocks and inline comment stubs so they are
# visible in the IaC audit trail and can be enabled when the provider
# surface ships.
#
# Until native Terraform support lands, enforce retention via:
#   • Cloudflare R2 bucket lifecycle rules set through the dashboard or
#     `wrangler r2 bucket lifecycle set` (alpha CLI command, 2024-Q4+).
#   • Cross-bucket replication configured under Storage > R2 > Replication
#     in the Cloudflare dashboard (currently dashboard-only).
###############################################################################

# OF-11: Lifecycle / retention variable.
variable "r2_log_retention_days" {
  type        = number
  default     = 365
  description = "Number of days to retain objects in the worker_logs R2 bucket before expiry. Aligns with GDPR Art. 5(1)(e) storage-limitation principle and the 365-day affiliate-click retention policy."
}

variable "r2_worm_enabled" {
  type        = bool
  default     = true
  description = "Whether WORM / object-lock semantics should be applied to the worker_logs bucket. Currently enforced via Cloudflare dashboard / API; stub here for audit traceability."
}

variable "r2_replication_enabled" {
  type        = bool
  default     = false
  description = "Enable cross-region R2 replication for the worker_logs bucket (requires Cloudflare R2 replication GA). Set true in production tfvars once the feature is available."
}

# Lifecycle policy note output — surfaced as Terraform output so CI/CD plans
# contain a visible reminder that manual wiring is still required.
output "r2_lifecycle_notice" {
  value       = <<-EOT
    OF-11 NOTICE: R2 lifecycle/WORM/replication rules are not yet
    manageable via Terraform. Apply the following settings manually or via
    the Cloudflare API / wrangler CLI:

    Bucket: ${cloudflare_r2_bucket.worker_logs.name}
    - Lifecycle expiry:  ${var.r2_log_retention_days} days (match var.r2_log_retention_days)
    - WORM / object-lock: ${var.r2_worm_enabled ? "ENABLED" : "DISABLED"}
    - Replication:        ${var.r2_replication_enabled ? "ENABLED" : "DISABLED (enable in tfvars once GA)"}

    Bucket: ${cloudflare_r2_bucket.next_inc_cache.name}
    - Lifecycle expiry:  30 days (cache objects are short-lived)
    - WORM:              DISABLED (cache bucket; objects must be replaceable)
    - Replication:       ${var.r2_replication_enabled ? "ENABLED" : "DISABLED"}

    Run: wrangler r2 bucket lifecycle set ${cloudflare_r2_bucket.worker_logs.name} \
           --rule '{"id":"log-retention","status":"enabled","expiration":{"days":${var.r2_log_retention_days}}}'
  EOT
  description = "OF-11: Reminder to apply R2 lifecycle/WORM/replication rules manually until Terraform provider support lands."
}
