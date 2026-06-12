###############################################################################
# Worker Custom Domains
#
# E2-05: Move domain routing from "Dashboard Managed" to Infrastructure-as-Code.
# This file manages Cloudflare Workers custom domains via Terraform instead
# of wrangler.jsonc, providing audit trails, version control, and drift detection.
#
# Domains managed here:
# - wristnerd.xyz (apex)
# - arabictools.wristnerd.xyz (subdomain)
# - crypto.wristnerd.xyz (subdomain)
# - cryptoranked.xyz (standalone domain)
#
# Note: compareai.site is intentionally excluded due to externally-managed
# DNS records (see externally-managed-domains.tf).
###############################################################################

# Worker custom domain for wristnerd.xyz (apex)
resource "cloudflare_workers_custom_domain" "wristnerd_xyz" {
  account_id = var.cloudflare_account_id
  hostname   = "wristnerd.xyz"
  service    = "affilite-mix"
  environment = "production"
}

# Worker custom domain for arabictools.wristnerd.xyz (subdomain)
resource "cloudflare_workers_custom_domain" "arabictools_wristnerd_xyz" {
  account_id = var.cloudflare_account_id
  hostname   = "arabictools.wristnerd.xyz"
  service    = "affilite-mix"
  environment = "production"
}

# Worker custom domain for crypto.wristnerd.xyz (subdomain)
resource "cloudflare_workers_custom_domain" "crypto_wristnerd_xyz" {
  account_id = var.cloudflare_account_id
  hostname   = "crypto.wristnerd.xyz"
  service    = "affilite-mix"
  environment = "production"
}

# Worker custom domain for cryptoranked.xyz (standalone domain)
resource "cloudflare_workers_custom_domain" "cryptoranked_xyz" {
  account_id = var.cloudflare_account_id
  hostname   = "cryptoranked.xyz"
  service    = "affilite-mix"
  environment = "production"
}

# Output for reference
output "worker_custom_domains" {
  description = "List of worker custom domains managed by Terraform"
  value = [
    cloudflare_workers_custom_domain.wristnerd_xyz.hostname,
    cloudflare_workers_custom_domain.arabictools_wristnerd_xyz.hostname,
    cloudflare_workers_custom_domain.crypto_wristnerd_xyz.hostname,
    cloudflare_workers_custom_domain.cryptoranked_xyz.hostname,
  ]
}
