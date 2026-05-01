# OF-07: R2 lifecycle.
resource "cloudflare_r2_bucket_lifecycle" "next_inc_cache" {
  account_id = var.cloudflare_account_id
  bucket_name = "next-inc-cache"
  rule { id = "expire-30d" status = "Enabled" expiration { days = 30 } }
}
