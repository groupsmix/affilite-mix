###############################################################################
# Externally-Managed Domains
#
# F-19: Track domains that are intentionally managed outside of wrangler.jsonc
# due to externally-managed DNS records or other constraints.
#
# This file serves as the single source of truth for domains that are:
# - Not in wrangler.jsonc routes
# - Managed via Cloudflare Dashboard instead of IaC
# - Have known constraints that prevent automated provisioning
#
# Domains listed here are considered intentional exclusions. CI will fail if
# a domain appears in the Cloudflare Dashboard but is neither in wrangler.jsonc
# nor in this exclusion list.
###############################################################################

# Externally-managed domains with their reasons for exclusion
locals {
  externally_managed_domains = {
    "compareai.site" = {
      reason        = "Pre-existing externally-managed A/CNAME records in Cloudflare DNS"
      constraint    = "API error 100117: Hostname already has externally managed DNS records"
      remediation   = <<-EOT
        1. Log in to Cloudflare Dashboard → compareai.site zone → DNS
        2. Delete ALL A/CNAME records at the apex and any subdomains
        3. Add to dns.auto.tfvars:
           external_zone_worker_domains = {
             "compareai.site" = "<compareai.site zone ID>"
           }
        4. Import existing custom domain if present:
           terraform import 'cloudflare_workers_custom_domain.external_zone_worker_domains["compareai.site"]' "<account-id>/<custom-domain-id>"
        5. Run terraform plan && terraform apply
        6. Verify: curl -H "Host: compareai.site" https://wristnerd.xyz/ returns 200
      EOT
      last_reviewed = "2026-06-15"
    }
  }
}

# Output for CI validation
output "externally_managed_domains_list" {
  description = "List of domains intentionally managed outside wrangler.jsonc"
  value       = keys(local.externally_managed_domains)
}
