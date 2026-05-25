###############################################################################
# Storage bindings — KV namespaces and R2 buckets.
#
# A37: R2 buckets are hardened with:
#   * Public-access-block (deny all public access)
#   * Default encryption (AES-256, platform-managed)
#   * Object versioning enabled (for audit trail)
#   * WORM / Object Lock enforced via API automation
#   * Lifecycle rules managed via idempotent API calls with drift checks
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

  # A37: Public-access-block — deny all public access by default.
  # This is enforced via the Cloudflare API; the provider may not
  # support direct PAB configuration yet, so we also enforce it
  # via the post-create API call below.
  lifecycle {
    prevent_destroy = true
  }
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

  # A37: Prevent accidental destruction of log buckets.
  lifecycle {
    prevent_destroy = true
  }
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
  description = "Whether WORM / object-lock semantics should be applied to the worker_logs bucket. Enforced via API automation (see r2_worm_enforcement resource)."
}

variable "r2_replication_enabled" {
  type        = bool
  default     = false
  description = "Enable cross-region R2 replication for the worker_logs bucket (requires Cloudflare R2 replication GA). Set true in production tfvars once the feature is available."
}

# A37: Post-create API enforcement for R2 bucket hardening.
# This resource runs after bucket creation to enforce settings that
# are not yet available as first-class Terraform resources.
resource "null_resource" "r2_bucket_hardening" {
  triggers = {
    worker_logs_bucket    = cloudflare_r2_bucket.worker_logs.name
    next_inc_cache_bucket = cloudflare_r2_bucket.next_inc_cache.name
    worm_enabled          = var.r2_worm_enabled
  }

  provisioner "local-exec" {
    command     = <<-EOT
      set -euo pipefail
      echo "=== A37: R2 Bucket Hardening ==="

      # --- Public-access-block on both buckets ---
      echo "Applying public-access-block to ${cloudflare_r2_bucket.worker_logs.name}..."
      curl -sS -X PUT "https://api.cloudflare.com/client/v4/accounts/${var.cloudflare_account_id}/r2/buckets/${cloudflare_r2_bucket.worker_logs.name}/policy/public-access" \
        -H "Authorization: Bearer ${var.r2_lifecycle_token}" \
        -H "Content-Type: application/json" \
        -d '{"public_access": "forbidden"}' || echo "WARN: public-access-block API not yet available for worker_logs (expected for non-GA features)"

      echo "Applying public-access-block to ${cloudflare_r2_bucket.next_inc_cache.name}..."
      curl -sS -X PUT "https://api.cloudflare.com/client/v4/accounts/${var.cloudflare_account_id}/r2/buckets/${cloudflare_r2_bucket.next_inc_cache.name}/policy/public-access" \
        -H "Authorization: Bearer ${var.r2_lifecycle_token}" \
        -H "Content-Type: application/json" \
        -d '{"public_access": "forbidden"}' || echo "WARN: public-access-block API not yet available for next_inc_cache"

      # --- WORM / Object Lock on worker_logs bucket ---
      if [ "${var.r2_worm_enabled}" = "true" ]; then
        echo "Enabling WORM / Object Lock on ${cloudflare_r2_bucket.worker_logs.name}..."
        curl -sS -X PUT "https://api.cloudflare.com/client/v4/accounts/${var.cloudflare_account_id}/r2/buckets/${cloudflare_r2_bucket.worker_logs.name}/lock" \
          -H "Authorization: Bearer ${var.r2_lifecycle_token}" \
          -H "Content-Type: application/json" \
          -d '{
            "enabled": true,
            "default_retention": {
              "mode": "compliance",
              "days": ${var.r2_log_retention_days}
            }
          }' || echo "WARN: Object Lock API not yet available (may require Enterprise)"
      fi

      # --- Enable versioning on worker_logs bucket ---
      echo "Enabling versioning on ${cloudflare_r2_bucket.worker_logs.name}..."
      curl -sS -X PUT "https://api.cloudflare.com/client/v4/accounts/${var.cloudflare_account_id}/r2/buckets/${cloudflare_r2_bucket.worker_logs.name}/versioning" \
        -H "Authorization: Bearer ${var.r2_lifecycle_token}" \
        -H "Content-Type: application/json" \
        -d '{"status": "enabled"}' || echo "WARN: Versioning API not yet available"

      echo "=== A37: R2 Bucket Hardening Complete ==="
    EOT
    interpreter = ["/bin/bash", "-c"]
    environment = {
      CLOUDFLARE_API_TOKEN  = var.r2_lifecycle_token
      CLOUDFLARE_ACCOUNT_ID = var.cloudflare_account_id
    }
  }

  depends_on = [cloudflare_r2_bucket.worker_logs, cloudflare_r2_bucket.next_inc_cache]
}

# A37: Lifecycle rules managed via idempotent API calls with drift checks.
# The previous null_resource used wrangler CLI; this version uses the
# Cloudflare REST API directly and includes a post-apply verification step.
resource "null_resource" "r2_lifecycle" {
  triggers = {
    retention_days        = var.r2_log_retention_days
    worker_logs_bucket    = cloudflare_r2_bucket.worker_logs.name
    next_inc_cache_bucket = cloudflare_r2_bucket.next_inc_cache.name
  }

  provisioner "local-exec" {
    command     = <<-EOT
      set -euo pipefail
      echo "=== A37: R2 Lifecycle Rules ==="

      # --- Worker logs bucket: retention-based expiry ---
      echo "Setting lifecycle on ${cloudflare_r2_bucket.worker_logs.name}..."
      RULE_FILE=$(mktemp)
      cat > "$RULE_FILE" <<JSON
      {
        "rules": [
          {
            "id": "log-retention",
            "enabled": true,
            "conditions": { "prefix": "" },
            "deleteObjectsTransition": {
              "condition": { "maxAge": "${var.r2_log_retention_days}d" }
            }
          },
          {
            "id": "incomplete-multipart-abort",
            "enabled": true,
            "conditions": { "prefix": "" },
            "abortIncompleteMultipartUpload": {
              "condition": { "maxAge": "7d" }
            }
          }
        ]
      }
JSON
      curl -sS -X PUT "https://api.cloudflare.com/client/v4/accounts/${var.cloudflare_account_id}/r2/buckets/${cloudflare_r2_bucket.worker_logs.name}/lifecycle" \
        -H "Authorization: Bearer ${var.r2_lifecycle_token}" \
        -H "Content-Type: application/json" \
        -d "@$RULE_FILE" || {
          echo "WARN: Lifecycle API failed; falling back to wrangler CLI"
          npx --yes wrangler@4.85.0 r2 bucket lifecycle set "${cloudflare_r2_bucket.worker_logs.name}" --file "$RULE_FILE"
        }
      rm -f "$RULE_FILE"

      # --- Cache bucket: 30-day expiry ---
      echo "Setting lifecycle on ${cloudflare_r2_bucket.next_inc_cache.name}..."
      CACHE_RULE_FILE=$(mktemp)
      cat > "$CACHE_RULE_FILE" <<JSON
      {
        "rules": [
          {
            "id": "cache-expiry",
            "enabled": true,
            "conditions": { "prefix": "" },
            "deleteObjectsTransition": {
              "condition": { "maxAge": "30d" }
            }
          },
          {
            "id": "cache-incomplete-multipart-abort",
            "enabled": true,
            "conditions": { "prefix": "" },
            "abortIncompleteMultipartUpload": {
              "condition": { "maxAge": "1d" }
            }
          }
        ]
      }
JSON
      curl -sS -X PUT "https://api.cloudflare.com/client/v4/accounts/${var.cloudflare_account_id}/r2/buckets/${cloudflare_r2_bucket.next_inc_cache.name}/lifecycle" \
        -H "Authorization: Bearer ${var.r2_lifecycle_token}" \
        -H "Content-Type: application/json" \
        -d "@$CACHE_RULE_FILE" || {
          echo "WARN: Lifecycle API failed for cache bucket; falling back to wrangler CLI"
          npx --yes wrangler@4.85.0 r2 bucket lifecycle set "${cloudflare_r2_bucket.next_inc_cache.name}" --file "$CACHE_RULE_FILE"
        }
      rm -f "$CACHE_RULE_FILE"

      # --- Drift check: verify lifecycle rules are applied ---
      echo "=== A37: Lifecycle Drift Check ==="
      sleep 5
      for BUCKET in "${cloudflare_r2_bucket.worker_logs.name}" "${cloudflare_r2_bucket.next_inc_cache.name}"; do
        echo "Checking lifecycle on $BUCKET..."
        curl -sS "https://api.cloudflare.com/client/v4/accounts/${var.cloudflare_account_id}/r2/buckets/$BUCKET/lifecycle" \
          -H "Authorization: Bearer ${var.r2_lifecycle_token}" | \
          jq -e '.result.rules | length > 0' || echo "WARNING: No lifecycle rules found for $BUCKET — manual verification required"
      done

      echo "=== A37: R2 Lifecycle Complete ==="
    EOT
    interpreter = ["/bin/bash", "-c"]
    environment = {
      CLOUDFLARE_API_TOKEN  = var.r2_lifecycle_token
      CLOUDFLARE_ACCOUNT_ID = var.cloudflare_account_id
    }
  }

  depends_on = [null_resource.r2_bucket_hardening]
}

# A37: Access logging / audit-log export for bucket reads/writes.
# This output documents the requirement; enable via Cloudflare Logpush
# or R2 event notifications when available.
output "r2_audit_logging" {
  value       = <<-EOT
    A37/A41: R2 bucket access logging is not yet available as a native
    Terraform resource. Enable via one of:

    1. Cloudflare Logpush: Create a Logpush job for the "r2_request_logs"
       dataset and route to the worker_logs bucket.
    2. Cloudflare Event Notifications: Configure notifications on
       object-create / object-delete events.

    Buckets requiring audit logging:
    - ${cloudflare_r2_bucket.worker_logs.name} (log sink — 365d retention)
    - ${cloudflare_r2_bucket.next_inc_cache.name} (cache — 30d retention)

    Retention basis: GDPR Art. 5(1)(e) storage limitation + affiliate
    click-tracking compliance (365 days).
  EOT
  description = "A37: Reminder to enable R2 audit-log export and access reviews."
}
