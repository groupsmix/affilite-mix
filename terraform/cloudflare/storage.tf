###############################################################################
# Storage bindings — KV namespaces and R2 buckets.
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

    Run: wrangler r2 bucket lifecycle set ${cloudflare_r2_bucket.worker_logs.name} --file <rules.json>
  EOT
  description = "OF-11: Reminder to apply R2 lifecycle/WORM/replication rules manually until Terraform provider support lands."
}

resource "null_resource" "worker_logs_lifecycle" {
  triggers = {
    retention_days = var.r2_log_retention_days
    bucket         = cloudflare_r2_bucket.worker_logs.name
  }

  provisioner "local-exec" {
    command = <<-EOT
      set -euo pipefail
      RULE_FILE=$(mktemp)
      cat > "$RULE_FILE" <<JSON
      {"rules":[{"id":"log-retention","enabled":true,"conditions":{"prefix":""},"deleteObjectsTransition":{"condition":{"maxAge":"${var.r2_log_retention_days}d"}}}]}
      JSON
      npx --yes wrangler@4.85.0 r2 bucket lifecycle set ${cloudflare_r2_bucket.worker_logs.name} --file "$RULE_FILE"
      rm -f "$RULE_FILE"
    EOT
    interpreter = ["/bin/bash", "-c"]
    environment = {
      CLOUDFLARE_API_TOKEN  = var.cloudflare_api_token
      CLOUDFLARE_ACCOUNT_ID = var.cloudflare_account_id
    }
  }
}
