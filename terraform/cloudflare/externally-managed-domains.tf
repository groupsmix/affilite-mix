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
# compareai.site was migrated to wrangler.jsonc routes on 2026-07-20.
locals {
  externally_managed_domains = {}
}

# Output for CI validation
output "externally_managed_domains_list" {
  description = "List of domains intentionally managed outside wrangler.jsonc"
  value       = keys(local.externally_managed_domains)
}
