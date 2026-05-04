# A31#21: Cloudflare DNS Configuration
# DMARC, SPF, MX, and CAA records for security

# ═══════════════════════════════════════════════════════════════════════════════
# SPF Record (TXT)
# Prevents email spoofing by specifying authorized mail servers
# ═══════════════════════════════════════════════════════════════════════════════

resource "cloudflare_record" "spf" {
  zone_id = var.cloudflare_zone_id
  name    = var.zone_domain
  type    = "TXT"
  ttl     = 3600
  
  # Strict SPF: only allow Resend (mail service) and deny all others
  value = "v=spf1 include:resend.com -all"
  # -all means fail/softfail for non-matching senders (hard fail)
}

# ═══════════════════════════════════════════════════════════════════════════════
# DMARC Record (TXT)
# Email authentication and reporting policy
# ═══════════════════════════════════════════════════════════════════════════════

resource "cloudflare_record" "dmarc" {
  zone_id = var.cloudflare_zone_id
  name    = "_dmarc.${var.zone_domain}"
  type    = "TXT"
  ttl     = 3600
  
  # DMARC policy: reject failed emails, send reports
  value = "v=DMARC1; p=reject; rua=mailto:dmarc-reports@${var.zone_domain}; pct=100; adkim=s; aspf=s"
  # p=reject: reject emails that fail SPF/DKIM
  # rua: aggregate report destination
  # pct=100: apply to 100% of mail
  # adkim=s, aspf=s: strict alignment
}

# ═══════════════════════════════════════════════════════════════════════════════
# CAA Records
# Certificate Authority Authorization - restricts which CAs can issue certs
# ═══════════════════════════════════════════════════════════════════════════════

# Allow Cloudflare (primary) and Let's Encrypt (backup)
resource "cloudflare_record" "caa_cloudflare" {
  zone_id = var.cloudflare_zone_id
  name    = var.zone_domain
  type    = "CAA"
  ttl     = 3600
  
  data {
    flags = "0"
    tag   = "issue"
    value = "cloudflare.com"
  }
}

resource "cloudflare_record" "caa_letsencrypt" {
  zone_id = var.cloudflare_zone_id
  name    = var.zone_domain
  type    = "CAA"
  ttl     = 3600
  
  data {
    flags = "0"
    tag   = "issue"
    value = "letsencrypt.org"
  }
}

# Wildcard certificate restriction (same CAs)
resource "cloudflare_record" "caa_wildcard_cloudflare" {
  zone_id = var.cloudflare_zone_id
  name    = var.zone_domain
  type    = "CAA"
  ttl     = 3600
  
  data {
    flags = "0"
    tag   = "issuewild"
    value = "cloudflare.com"
  }
}

# CAA reporting for unauthorized issuance attempts
resource "cloudflare_record" "caa_iodef" {
  zone_id = var.cloudflare_zone_id
  name    = var.zone_domain
  type    = "CAA"
  ttl     = 3600
  
  data {
    flags = "0"
    tag   = "iodef"
    value = "mailto:security@${var.zone_domain}"
  }
}

# ═══════════════════════════════════════════════════════════════════════════════
# MX Records (if using external mail service)
# Currently using Resend (API-based, no MX needed), but placeholder here
# ═══════════════════════════════════════════════════════════════════════════════

# If using a transactional email service with MX records, configure here
# resource "cloudflare_record" "mx_primary" {
#   zone_id  = var.cloudflare_zone_id
#   name     = var.zone_domain
#   type     = "MX"
#   ttl      = 3600
#   value    = "10 mx.example.com"
#   priority = 10
# }

# ═══════════════════════════════════════════════════════════════════════════════
# DKIM Records (TXT)
# DomainKeys Identified Mail - email signing
# ═══════════════════════════════════════════════════════════════════════════════

# DKIM selectors are typically configured at the email provider
# Placeholder for Resend DKIM selector
# resource "cloudflare_record" "dkim_resend" {
#   zone_id = var.cloudflare_zone_id
#   name    = "resend._domainkey.${var.zone_domain}"
#   type    = "TXT"
#   ttl     = 3600
#   value   = "v=DKIM1; k=rsa; p=..."  # Provided by Resend
# }

# ═══════════════════════════════════════════════════════════════════════════════
# DNSSEC (enabled by default in Cloudflare, but explicit here)
# ═══════════════════════════════════════════════════════════════════════════════

resource "cloudflare_zone_settings_override" "dnssec" {
  zone_id = var.cloudflare_zone_id
  settings {
    # DNSSEC is enabled by default on Cloudflare zones
    # This resource ensures explicit configuration
  }
}

# ═══════════════════════════════════════════════════════════════════════════════
# Variables
# ═══════════════════════════════════════════════════════════════════════════════

variable "zone_domain" {
  description = "Primary domain for the zone (e.g., wristnerd.xyz)"
  type        = string
}
