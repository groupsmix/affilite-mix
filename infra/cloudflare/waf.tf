# ═══════════════════════════════════════════════════════════════════════════════
# WAF & Edge Security Rules — Cloudflare Rulesets
#
# Codifies the WAF assumptions documented in docs/cloudflare-strategy.md §10.
# These rules run at the Cloudflare edge before traffic reaches the Worker.
# ═══════════════════════════════════════════════════════════════════════════════

# ─── 1. Admin route protection ───────────────────────────────────────────────
# Block known bad bots and challenge suspicious requests on /admin/*
resource "cloudflare_ruleset" "waf_custom" {
  zone_id     = var.zone_id
  name        = "affilite-mix-waf-custom-rules"
  description = "Custom WAF rules for Affilite-Mix (managed by Terraform)"
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  # Rule 1: Block known bad bots targeting admin routes
  rules {
    action      = "block"
    expression  = "(http.request.uri.path matches \"^/admin\" and cf.bot_management.score lt 10)"
    description = "Block low-score bots from admin panel"
    enabled     = true
  }

  # Rule 2: Challenge suspicious requests to admin login
  rules {
    action      = "managed_challenge"
    expression  = "(http.request.uri.path eq \"/admin/login\" and cf.bot_management.score lt 30)"
    description = "Challenge suspicious admin login requests"
    enabled     = true
  }

  # Rule 3: Block direct access to internal API routes from outside
  rules {
    action      = "block"
    expression  = "(http.request.uri.path matches \"^/api/internal/\" and not http.request.uri.path contains \"resolve-site\")"
    description = "Block external access to internal API endpoints"
    enabled     = true
  }

  # Rule 4: Challenge non-GET requests from very low bot scores on public API
  rules {
    action      = "managed_challenge"
    expression  = "(http.request.uri.path matches \"^/api/\" and not http.request.method in {\"GET\" \"HEAD\" \"OPTIONS\"} and cf.bot_management.score lt 15)"
    description = "Challenge bot-like state-changing API requests"
    enabled     = true
  }
}

# ─── 2. Rate limiting rules ─────────────────────────────────────────────────
resource "cloudflare_ruleset" "rate_limits" {
  zone_id     = var.zone_id
  name        = "affilite-mix-rate-limits"
  description = "Rate limiting rules for Affilite-Mix (managed by Terraform)"
  kind        = "zone"
  phase       = "http_ratelimit"

  # Rate limit: Admin routes — prevent brute-force attacks
  rules {
    action      = "block"
    expression  = "(http.request.uri.path matches \"^/admin\")"
    description = "Rate limit admin routes (${var.waf_admin_rate_limit_rps} req/10s per IP)"
    enabled     = true

    ratelimit {
      characteristics     = ["ip.src"]
      period              = 10
      requests_per_period = var.waf_admin_rate_limit_rps
      mitigation_timeout  = 60
    }
  }

  # Rate limit: Affiliate click tracking — prevent click fraud
  rules {
    action      = "block"
    expression  = "(http.request.uri.path eq \"/api/track/click\")"
    description = "Rate limit click tracking (${var.waf_click_track_rate_limit_per_min} req/min per IP)"
    enabled     = true

    ratelimit {
      characteristics     = ["ip.src"]
      period              = 60
      requests_per_period = var.waf_click_track_rate_limit_per_min
      mitigation_timeout  = 300
    }
  }

  # Rate limit: Newsletter signup — prevent spam
  rules {
    action      = "block"
    expression  = "(http.request.uri.path eq \"/api/newsletter\")"
    description = "Rate limit newsletter signups (${var.waf_newsletter_rate_limit_per_hour} req/hour per IP)"
    enabled     = true

    ratelimit {
      characteristics     = ["ip.src"]
      period              = 3600
      requests_per_period = var.waf_newsletter_rate_limit_per_hour
      mitigation_timeout  = 3600
    }
  }

  # Rate limit: Public API — general abuse prevention
  rules {
    action      = "managed_challenge"
    expression  = "(http.request.uri.path matches \"^/api/\" and not http.request.uri.path matches \"^/api/cron\")"
    description = "Rate limit public API (${var.waf_api_rate_limit_rps} req/10s per IP)"
    enabled     = true

    ratelimit {
      characteristics     = ["ip.src"]
      period              = 10
      requests_per_period = var.waf_api_rate_limit_rps
      mitigation_timeout  = 30
    }
  }
}

# ─── 3. Managed WAF rulesets (OWASP Core + Cloudflare Managed) ──────────────
# Enable Cloudflare's managed WAF rulesets for baseline protection.
# These cover OWASP Top 10 (SQLi, XSS, SSRF, etc.).
resource "cloudflare_ruleset" "managed_waf" {
  zone_id     = var.zone_id
  name        = "affilite-mix-managed-waf"
  description = "Managed WAF rulesets (managed by Terraform)"
  kind        = "zone"
  phase       = "http_request_firewall_managed"

  # Cloudflare Managed Ruleset
  rules {
    action = "execute"
    action_parameters {
      id = "efb7b8c949ac4650a09736fc376e9aee" # Cloudflare Managed Ruleset
    }
    expression  = "true"
    description = "Execute Cloudflare Managed Ruleset"
    enabled     = true
  }

  # OWASP Core Ruleset
  rules {
    action = "execute"
    action_parameters {
      id = "4814384a9e5d4991b9815dcfc25d2f1f" # Cloudflare OWASP Core Ruleset
    }
    expression  = "true"
    description = "Execute Cloudflare OWASP Core Ruleset"
    enabled     = true
  }
}
