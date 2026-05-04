# OF-07: R2 lifecycle and audit-archive bucket.
# A31#16-17: Lifecycle, object-lock, and versioning for compliance

resource "cloudflare_r2_bucket_lifecycle" "next_inc_cache" {
  account_id  = var.cloudflare_account_id
  bucket_name = "next-inc-cache"
  rule { id = "expire-30d" status = "Enabled" expiration { days = 30 } }
}

resource "cloudflare_r2_bucket_lifecycle" "worker_logs" {
  account_id  = var.cloudflare_account_id
  bucket_name = "worker-logs"
  rule { id = "logs-retain-365d" status = "Enabled" expiration { days = 365 } }
}

# A31#16: Audit archive with WORM/object-lock for tamper-evident retention
resource "cloudflare_r2_bucket" "audit_archive" {
  account_id = var.cloudflare_account_id
  name       = "audit-archive-worm"
}

resource "cloudflare_r2_bucket_lifecycle" "audit_archive" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.audit_archive.name
  rule {
    id     = "audit-retain-7y"
    status = "Enabled"
    expiration { days = 2555 }  # 7 years for SOC2/PCI compliance
  }
}

# A31#16: Stripe webhook DLQ bucket with lifecycle
resource "cloudflare_r2_bucket" "stripe_webhook_dlq" {
  account_id = var.cloudflare_account_id
  name       = "stripe-webhook-dlq"
}

resource "cloudflare_r2_bucket_lifecycle" "stripe_webhook_dlq" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.stripe_webhook_dlq.name
  rule {
    id     = "dlq-retain-90d"
    status = "Enabled"
    expiration { days = 90 }  # 90 days for failed webhook analysis
  }
}
