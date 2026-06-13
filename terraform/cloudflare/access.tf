###############################################################################
# Cloudflare Access Configuration
#
# F-08: Add Cloudflare Access gating for admin segment
#
# The admin routes (/q7m-k4j9/*) currently use path obfuscation
# (randomized path segment) as a security measure. This is security by
# obscurity and should be supplemented with proper edge-level authentication
# via Cloudflare Access (Zero Trust).
#
# LIMITATION: Cloudflare Access cannot protect specific path segments
# within a worker. It can only protect the entire worker or specific
# routes. Since the admin routes are under the same worker as public routes,
# we document this limitation and recommend alternative approaches.
#
# ALTERNATIVE APPROACHES:
# 1. Split admin routes to a separate worker with dedicated Cloudflare Access
# 2. Use Cloudflare Workers KV to store a whitelist of allowed IPs/emails
# 3. Use Cloudflare WAF rules to restrict access to /q7m-k4j9/* paths
# 4. Implement application-level authz checks (already done via requireAdmin)
#
# CURRENT STATE:
# - Admin routes are protected by application-level authz (requireAdmin)
# - Path obfuscation (/q7m-k4j9/) provides minimal additional security
# - No edge-level gating exists
#
# RECOMMENDATION:
# For true edge-level protection, deploy admin routes to a separate worker
# with Cloudflare Access enabled. This would require:
# - Creating a new worker (affilite-mix-admin)
# - Moving admin routes to the new worker
# - Configuring Cloudflare Access policies for the new worker
# - Updating DNS/routing accordingly
#
# This is tracked as a future improvement due to the complexity of the migration.
###############################################################################

# F-08: Cloudflare Access Application for Admin Worker (Future Implementation)
#
# This resource is commented out because it requires a separate admin worker.
# Uncomment and configure when admin routes are moved to a dedicated worker.
#
# resource "cloudflare_access_application" "admin_worker" {
#   account_id       = var.cloudflare_account_id
#   name            = "Affilite-Mix Admin"
#   type            = "self_hosted"
#   domain          = "admin.wristnerd.xyz" # Separate subdomain for admin
#   session_duration = "24h"
#
#   # Require email authentication via Cloudflare Access
#   policy {
#     name = "Admin Access Policy"
#     decision = "allow"
#     include {
#       email = [
#         # Add admin email addresses here
#         # "admin@example.com"
#       ]
#     }
#   }
# }

# F-08: Cloudflare Access Group for Admin Users (Future Implementation)
#
# resource "cloudflare_access_group" "admin_users" {
#   account_id = var.cloudflare_account_id
#   name       = "Admin Users"
#
#   include {
#     email = [
#       # Add admin email addresses here
#       # "admin@example.com"
#     ]
#   }
# }

# F-08: Cloudflare WAF Rule for Admin Path Protection (Interim Solution)
#
# As an interim measure before splitting the admin worker, we can use
# Cloudflare WAF rules to restrict access to the /q7m-k4j9/* paths.
# This provides edge-level protection without requiring a separate worker.
#
# resource "cloudflare_filter" "admin_path_filter" {
#   zone_id     = var.cloudflare_zone_id
#   expression   = "(http.request.uri.path matches \"^/q7m-k4j9/.*\")"
#   description  = "Filter for admin path segment"
# }

# resource "cloudflare_firewall_rule" "admin_path_protection" {
#   zone_id     = var.cloudflare_zone_id
#   description = "F-08: Restrict access to admin paths"
#   filter_id   = cloudflare_filter.admin_path_filter.id
#   action      = "allow"
#
#   # Allow only from specific IP ranges or Cloudflare Access
#   # This is a simplified example - adjust based on your requirements
#   # configuration {
#   #   target = "ip"
#   #   values = ["192.0.2.0/24"] # Example: specific office IP range
#   # }
# }

###############################################################################
# Documentation: Path Obfuscation Limitation
###############################################################################

# F-08: Path Obfuscation Security Assessment
#
# Current Implementation:
# - Admin routes are under /q7m-k4j9/ (randomized path segment)
# - This provides security by obscurity, not true security
# - An attacker who discovers the path can access admin routes
#
# Limitations:
# 1. Path can be discovered through:
#    - Browser history/bookmarks
#    - Referer headers from other sites
#    - Log files
#    - Network traffic analysis
# 2. No edge-level authentication
# 3. No IP-based restrictions
# 4. No rate limiting at the edge
#
# Compensating Controls:
# 1. Application-level authz (requireAdmin) - strong, but at application layer
# 2. Admin session strict mode (ADMIN_SESSION_STRICT=true)
# 3. Per-trigger cron secrets for internal endpoints
# 4. Audit logging of all admin actions
#
# Risk Assessment:
# - Risk Level: MEDIUM
# - Impact: Unauthorized access to admin interface
# - Likelihood: LOW (requires path discovery + valid credentials)
#
# Mitigation Timeline:
# - Short-term: Implement WAF rule for admin paths (interim)
# - Medium-term: Split admin to separate worker with Cloudflare Access
# - Long-term: Consider IP-based restrictions or MFA for admin access
