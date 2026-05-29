###############################################################################
# dns.auto.tfvars — Zone-specific DNS record overrides for groupsmix.com.
#
# These override the defaults in dns.tf for the primary zone. For other zones,
# create separate tfvars files (e.g. oltigo.auto.tfvars) or use workspaces.
#
# SEASON 6d audit remediation (A144–A151):
#   - A144-01: DMARC added (p=none monitoring phase → ramp to p=reject)
#   - A144-03/A144-05: SPF includes both CF Email Routing + Resend
#   - A144-08: verify _spf.resend.com resolves before applying
#   - A145-02/A148-01: CAA pins Let's Encrypt + Google Trust Services
#   - A145-03: MTA-STS discovery record
#   - A145-04: TLS-RPT reporting
###############################################################################

dns_records = {
  # ── A144: Email authentication ─────────────────────────────────────────
  # A144-03/A144-05: SPF authorises CF Email Routing (inbound forwarding)
  # and Resend (outbound newsletter/confirmation sends).
  # Keep ~all (softfail) until ≥30 days of clean DMARC reports, then -all.
  "spf-apex" = {
    name    = "@"
    type    = "TXT"
    content = "v=spf1 include:_spf.mx.cloudflare.net include:_spf.resend.com -all"
    ttl     = 300
    proxied = false
    comment = "A144-03/A144-05: SPF — CF Email Routing + Resend. Tighten ~all to -all after DMARC monitoring."
  }

  # A144-01: DMARC — monitoring phase (p=none).
  # Ramp plan: p=none (30d) → p=quarantine pct=50 → p=quarantine → p=reject.
  # rua receives aggregate XML reports; ruf receives forensic failure samples.
  "dmarc-apex" = {
    name    = "_dmarc"
    type    = "TXT"
    content = "v=DMARC1; p=none; sp=none; pct=100; adkim=s; aspf=s; fo=1; rua=mailto:dmarc-reports@groupsmix.com; ruf=mailto:dmarc-forensics@groupsmix.com"
    ttl     = 300
    proxied = false
    comment = "A144-01: DMARC monitoring phase. Ramp to p=reject after clean reports."
  }

  # ── A145: DNS hardening ────────────────────────────────────────────────
  # A145-02: CAA — restrict issuance to Let's Encrypt + Google Trust Services.
  "caa-issue-le" = {
    name    = "@"
    type    = "CAA"
    content = "0 issue \"letsencrypt.org\""
    ttl     = 3600
    proxied = false
    comment = "A145-02: CAA — allow Let's Encrypt cert issuance."
  }
  "caa-issue-google" = {
    name    = "@"
    type    = "CAA"
    content = "0 issue \"pki.goog\""
    ttl     = 3600
    proxied = false
    comment = "A145-02/A148-01: CAA — allow Google Trust Services cert issuance."
  }
  "caa-issuewild" = {
    name    = "@"
    type    = "CAA"
    content = "0 issuewild \";\""
    ttl     = 3600
    proxied = false
    comment = "A145-02: CAA — block wildcard cert issuance."
  }
  "caa-iodef" = {
    name    = "@"
    type    = "CAA"
    content = "0 iodef \"mailto:security@groupsmix.com\""
    ttl     = 3600
    proxied = false
    comment = "A145-02: CAA iodef — cert mis-issuance reporting."
  }

  # A145-03: MTA-STS discovery — update id= after every policy change.
  "mta-sts" = {
    name    = "_mta-sts"
    type    = "TXT"
    content = "v=STSv1; id=20260529000000;"
    ttl     = 300
    proxied = false
    comment = "A145-03: MTA-STS discovery. Update id= after every policy change."
  }

  # A145-04: TLS-RPT — receive reports on SMTP TLS failures.
  "tls-rpt" = {
    name    = "_smtp._tls"
    type    = "TXT"
    content = "v=TLSRPTv1; rua=mailto:tls-reports@groupsmix.com"
    ttl     = 300
    proxied = false
    comment = "A145-04: TLS-RPT — SMTP TLS failure reporting."
  }
}
