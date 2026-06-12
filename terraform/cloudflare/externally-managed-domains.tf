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
    compareai.site = {
      reason = "Pre-existing externally-managed A/CNAME records in Cloudflare DNS"
      constraint = "API error 100117: Hostname already has externally managed DNS records"
      remediation = "Delete A/CNAME records in Cloudflare Dashboard (compareai.site zone -> DNS) before adding to wrangler.jsonc"
      last_reviewed = "2026-06-11"
    }
  }
}

# Output for CI validation
output "externally_managed_domains_list" {
  description = "List of domains intentionally managed outside wrangler.jsonc"
  value = keys(locals.externally_managed_domains)
}