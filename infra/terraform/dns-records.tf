# OF-25 / SEASON 6d (A144–A151): SPF / DMARC / CAA / MTA-STS / TLS-RPT
# managed in IaC. Keep in sync with terraform/cloudflare/dns.tf defaults.

# ── A144: Email authentication ───────────────────────────────────────────────
# A144-03/A144-05: SPF authorises both CF Email Routing and Resend.
# ~all (softfail) until DMARC monitoring is clean, then -all.
resource "cloudflare_record" "spf" {
  zone_id = var.cloudflare_zone_id
  name    = "@"
  type    = "TXT"
  value   = "v=spf1 include:_spf.mx.cloudflare.net include:_spf.resend.com ~all"
  ttl     = 3600
}

# A144-01: DMARC — monitoring phase (p=none).
# Ramp plan: p=none (30d) → p=quarantine pct=50 → p=quarantine → p=reject.
resource "cloudflare_record" "dmarc" {
  zone_id = var.cloudflare_zone_id
  name    = "_dmarc"
  type    = "TXT"
  value   = "v=DMARC1; p=none; sp=none; pct=100; adkim=s; aspf=s; fo=1; rua=mailto:dmarc-reports@groupsmix.com; ruf=mailto:dmarc-forensics@groupsmix.com"
  ttl     = 3600
}

# ── A145: DNS hardening ──────────────────────────────────────────────────────
# A145-02/A148-01: CAA — restrict cert issuance to known CAs.
resource "cloudflare_record" "caa_issue_le" {
  zone_id = var.cloudflare_zone_id
  name    = "@"
  type    = "CAA"
  data {
    flags = 0
    tag   = "issue"
    value = "letsencrypt.org"
  }
  ttl = 3600
}
resource "cloudflare_record" "caa_issue_google" {
  zone_id = var.cloudflare_zone_id
  name    = "@"
  type    = "CAA"
  data {
    flags = 0
    tag   = "issue"
    value = "pki.goog"
  }
  ttl = 3600
}
resource "cloudflare_record" "caa_issuewild" {
  zone_id = var.cloudflare_zone_id
  name    = "@"
  type    = "CAA"
  data {
    flags = 0
    tag   = "issuewild"
    value = ";"
  }
  ttl = 3600
}
resource "cloudflare_record" "caa_iodef" {
  zone_id = var.cloudflare_zone_id
  name    = "@"
  type    = "CAA"
  data {
    flags = 0
    tag   = "iodef"
    value = "mailto:security@groupsmix.com"
  }
  ttl = 3600
}

# A145-03: MTA-STS discovery — update id= after every policy change.
resource "cloudflare_record" "mta_sts" {
  zone_id = var.cloudflare_zone_id
  name    = "_mta-sts"
  type    = "TXT"
  value   = "v=STSv1; id=20260529000000;"
  ttl     = 3600
}

# A145-04: TLS-RPT — SMTP TLS failure reporting.
resource "cloudflare_record" "tls_rpt" {
  zone_id = var.cloudflare_zone_id
  name    = "_smtp._tls"
  type    = "TXT"
  value   = "v=TLSRPTv1; rua=mailto:tls-reports@groupsmix.com"
  ttl     = 3600
}
