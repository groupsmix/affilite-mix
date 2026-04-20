# Production environment configuration.
# Wraps the root cloudflare module with production-specific values.
#
# Usage:
#   cd infra/environments/production
#   terraform init
#   terraform plan
#   terraform apply

module "cloudflare" {
  source = "../../cloudflare"

  cloudflare_api_token  = var.cloudflare_api_token
  cloudflare_account_id = var.cloudflare_account_id
  zone_id               = var.zone_id
  domain                = var.domain
  worker_name           = "affilite-mix"
  environment           = "production"

  custom_domains = var.custom_domains

  waf_admin_rate_limit_rps           = 30
  waf_api_rate_limit_rps             = 100
  waf_newsletter_rate_limit_per_hour = 3
  waf_click_track_rate_limit_per_min = 60
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
