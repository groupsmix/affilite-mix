###############################################################################
# Domain Exclusions Tracking
#
# F-19: This file tracks domains that are intentionally excluded from the
# wrangler.jsonc routes array due to external DNS management or other
# operational reasons. This prevents configuration drift and ensures that
# all custom domains are tracked in IaC.
#
# Each exclusion must include:
# - domain: The domain name
# - reason: Why it's excluded from wrangler.jsonc routes
# - managed_by: Where the DNS is managed (e.g., "Cloudflare Dashboard", "External DNS")
# - last_reviewed: Date when this exclusion was last reviewed
# - review_frequency: How often this should be reviewed (e.g., "quarterly")
###############################################################################

# F-19: compareai.site custom domain
# This domain is managed outside of wrangler.jsonc due to external DNS
# configuration. The domain is intentionally absent from the routes array
# in wrangler.jsonc to prevent conflicts with the external DNS setup.
#
# To migrate to IaC:
# 1. Add the domain to wrangler.jsonc routes array
# 2. Update DNS to point to Cloudflare Workers
# 3. Remove this exclusion entry
# 4. Verify the domain resolves correctly

variable "excluded_domains" {
  type = map(object({
    domain           = string
    reason           = string
    managed_by       = string
    last_reviewed    = string
    review_frequency = string
  }))
  default = {
    "compareai_site" = {
      domain           = "compareai.site"
      reason           = "External DNS management - domain not managed via wrangler.jsonc routes"
      managed_by       = "Cloudflare Dashboard (manual)"
      last_reviewed    = "2025-01-15"
      review_frequency = "quarterly"
    }
  }
  description = "Domains intentionally excluded from wrangler.jsonc routes for tracking purposes"
}

output "excluded_domains_list" {
  value       = var.excluded_domains
  description = "List of domains excluded from wrangler.jsonc with reasons"
}
