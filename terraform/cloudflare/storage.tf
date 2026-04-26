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
