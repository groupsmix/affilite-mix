# OF-07: R2 lifecycle and audit-archive bucket.
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
resource "cloudflare_r2_bucket" "audit_archive" {
  account_id = var.cloudflare_account_id
  name       = "audit-archive-worm"
}
