# Staging environment configuration.
# Uses relaxed rate limits for testing.
#
# Usage:
#   cd infra/environments/staging
#   terraform init
#   terraform plan
#   terraform apply

module "cloudflare" {
  source = "../../cloudflare"

  cloudflare_api_token  = var.cloudflare_api_token
  cloudflare_account_id = var.cloudflare_account_id
  zone_id               = var.zone_id
  domain                = var.domain
  worker_name           = "affilite-mix-staging"
  environment           = "staging"

  custom_domains = var.custom_domains

  # Relaxed rate limits for staging/QA
  waf_admin_rate_limit_rps           = 100
  waf_api_rate_limit_rps             = 500
  waf_newsletter_rate_limit_per_hour = 50
  waf_click_track_rate_limit_per_min = 300
}

variable "cloudflare_api_token" {
  type      = string
  sensitive = true
}
variable "cloudflare_account_id" { type = string }
variable "zone_id" { type = string }
variable "domain" { type = string }
variable "custom_domains" { type = list(string) }

output "kv_namespace_id" { value = module.cloudflare.kv_namespace_id }
output "r2_bucket_name" { value = module.cloudflare.r2_bucket_name }
