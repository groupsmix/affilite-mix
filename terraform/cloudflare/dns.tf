###############################################################################
# DNS records and Worker custom domains.
#
# Sources of truth, by record type:
#
#   * Worker custom domains (apex + subdomains served by the affilite-mix
#     worker) → managed by `cloudflare_workers_custom_domain` below. Cloudflare
#     auto-provisions the matching DNS record (an internal CNAME-like) when
#     the custom domain is created, so no separate `cloudflare_dns_record`
#     entry is required for those hostnames.
#
#   * MX, TXT, CAA, SPF/DKIM/DMARC, verification records, and any third-party
#     subdomains (e.g. status pages, marketing tools) → managed by
#     `cloudflare_dns_record` below. Add new ones to the `dns_records` map in
#     terraform.tfvars rather than editing this file directly.
#
# Worker routes (e.g. "*.wristnerd.xyz/*") stay in wrangler.jsonc because they
# are coupled to the Worker bundle. Custom domains, by contrast, are pure
# infrastructure and benefit from drift detection — hence Terraform.
#
# Importing existing resources (one-time):
#
#   terraform import 'cloudflare_workers_custom_domain.worker_domains["wristnerd.xyz"]' \
#     "${var.cloudflare_account_id}/<custom-domain-id>"
#   terraform import 'cloudflare_dns_record.records["mx-google-1"]' \
#     "${var.zone_id}/<record-id>"
#
# Use `./scripts/cf-security-snapshot.sh` to dump the current DNS records and
# `curl .../accounts/<id>/workers/domains` to enumerate custom domains before
# importing.
###############################################################################

variable "worker_service_name" {
  type        = string
  description = "Worker service name to bind custom domains to. Must match the `name` field in wrangler.jsonc."
  default     = "affilite-mix"
}

variable "worker_environment" {
  type        = string
  description = "Worker environment for custom domains (typically 'production')."
  default     = "production"
}

variable "worker_custom_domains" {
  type        = set(string)
  description = "Hostnames served by the affilite-mix Worker. Mirrors the `routes[].pattern` entries with `custom_domain = true` in wrangler.jsonc."
  default = [
    "wristnerd.xyz",
    "arabictools.wristnerd.xyz",
    "crypto.wristnerd.xyz",
  ]
}

variable "dns_records" {
  type = map(object({
    name    = string
    type    = string
    content = string
    ttl     = optional(number, 1) # 1 = automatic
    # A39: Default to proxied=true for public web records.
    # Any record with proxied=false must include an exception comment.
    proxied  = optional(bool, true)
    comment  = optional(string)
    priority = optional(number)
  }))
  description = <<-EOT
    Map of zone-level DNS records to manage in IaC. Keyed by a stable identifier
    (e.g. "mx-google-1") so renames in tfvars don't force-recreate records.

    Worker-served hostnames must NOT be listed here — they are provisioned
    automatically by `cloudflare_workers_custom_domain` and managing them
    here as well will cause a conflict.
  EOT
  default = {
    # ── A144: Email authentication ─────────────────────────────────────
    # SPF: authorise Cloudflare Email Routing (inbound forwarding) and
    # Resend (outbound newsletter sends) as legitimate senders.
    # A144-03/A144-05: both include:s are required; omitting CF Email
    # Routing causes SPF failures on forwarded replies, omitting Resend
    # causes SPF failures on newsletter confirmation mails.
    # F9: hardfail (-all).
    # A39: proxied=false required — TXT records for email auth must not
    # be proxied or they will not be visible to receiving MTAs.
    "spf" = {
      name    = "@"
      type    = "TXT"
      content = "v=spf1 include:_spf.mx.cloudflare.net include:_spf.resend.com -all"
      ttl     = 300
      proxied = false
      comment = "A144-03/A144-05/A39/F9/S8-F6: SPF — CF Email Routing + Resend, hardfail all others. DNS-only (unproxied)."
    }

    # DMARC: start at p=none for monitoring, ramp to p=quarantine after
    # 30 days of clean aggregate reports, then p=reject.
    # Ramp plan: p=none → p=quarantine (pct=50) → p=quarantine → p=reject.
    # Override this default in dns.auto.tfvars with rua/ruf addresses.
    # A144-01: six of seven zones had NO DMARC record.
    # A39: proxied=false required — DMARC records must be DNS-visible.
    "dmarc" = {
      name    = "_dmarc"
      type    = "TXT"
      content = "v=DMARC1; p=none; sp=none; pct=100; adkim=s; aspf=s; fo=1"
      ttl     = 300
      proxied = false
      comment = "A144-01/A39: DMARC monitoring phase. Add rua/ruf in tfvars. Ramp to p=reject after clean reports. DNS-only (unproxied)."
    }

    # ── A145: DNS hardening ────────────────────────────────────────────
    # CAA: only Let's Encrypt may issue certificates for this zone.
    # A39: proxied=false required — CAA records must be DNS-visible for
    # certificate authorities to read them.
    "caa-issue" = {
      name    = "@"
      type    = "CAA"
      content = "0 issue \"letsencrypt.org\""
      ttl     = 3600
      proxied = false
      comment = "A145/A39: CAA — restrict cert issuance to Let's Encrypt. DNS-only (unproxied) by design."
    }

    # A39: proxied=false required — CAA records must be DNS-visible.
    "caa-issuewild" = {
      name    = "@"
      type    = "CAA"
      content = "0 issuewild \";\""
      ttl     = 3600
      proxied = false
      comment = "A145-02/A39: CAA — block wildcard cert issuance from all CAs. DNS-only (unproxied)."
    }

    # A145-02/A148-01: Allow Google Trust Services to issue certs (used by
    # Cloudflare Universal SSL). Without this, GTS issuance is uncontrolled.
    # A39: proxied=false required — CAA records must be DNS-visible.
    "caa-issue-google" = {
      name    = "@"
      type    = "CAA"
      content = "0 issue \"pki.goog\""
      ttl     = 3600
      proxied = false
      comment = "A145-02/A148-01/A39: CAA — allow Google Trust Services cert issuance. DNS-only (unproxied)."
    }

    # A145-02: Security contact for certificate mis-issuance reports.
    # A39: proxied=false required — CAA records must be DNS-visible.
    "caa-iodef" = {
      name    = "@"
      type    = "CAA"
      content = "0 iodef \"mailto:security@groupsmix.com\""
      ttl     = 3600
      proxied = false
      comment = "A145-02/A39: CAA iodef — cert mis-issuance reporting. DNS-only (unproxied)."
    }

    # ── A249-H2: DKIM signing record ──────────────────────────────────────
    # Resend publishes DKIM keys under the `resend` selector. This CNAME
    # delegates key rotation to Resend's infrastructure so the signing
    # key stays current without manual IaC updates.
    # ⚠ VERIFY: confirm the exact CNAME target in your Resend dashboard
    #   (Domains → DNS records) — Resend may use a per-account value
    #   (e.g. resend._domainkey.<hash>.dkim.amazonses.com) instead of
    #   the generic resend._domainkey.resend.dev shown here.
    # A39: proxied=false required — DKIM CNAME must be DNS-visible.
    "dkim-resend" = {
      name    = "resend._domainkey"
      type    = "CNAME"
      content = "resend._domainkey.resend.dev"
      ttl     = 300
      proxied = false
      comment = "S8-F2/A144/A39: DKIM — delegates signing key to Resend. DNS-only (unproxied) by design."
    }

    # MTA-STS discovery record — id= must change whenever the policy changes.
    # A39: proxied=false required — MTA-STS TXT records must be DNS-visible.
    "mta-sts" = {
      name    = "_mta-sts"
      type    = "TXT"
      content = "v=STSv1; id=20260515000000;"
      ttl     = 300
      proxied = false
      comment = "A145/A39: MTA-STS discovery. Update id= after every policy change. DNS-only (unproxied) by design."
    }

    # TLS-RPT: receive JSON reports when a sending MTA cannot establish TLS.
    # A39: proxied=false required — TLS-RPT records must be DNS-visible.
    "tls-rpt" = {
      name    = "_smtp._tls"
      type    = "TXT"
      content = "v=TLSRPTv1; rua=mailto:tls-reports@wristnerd.xyz"
      ttl     = 300
      proxied = false
      comment = "A145/A39: TLS-RPT — SMTP TLS failure reporting. DNS-only (unproxied) by design."
    }
  }
}

# ── S8-F1 / A249-H1: DNSSEC ──────────────────────────────────────────────
# Enable DNSSEC on the zone to prevent DNS response forgery (cache
# poisoning, on-path manipulation). Cloudflare manages the signing
# keys; the DS record must be added at the registrar after initial
# apply (Cloudflare dashboard shows the DS parameters).
resource "cloudflare_zone_dnssec" "this" {
  zone_id = var.zone_id
  status  = "active"
}

resource "cloudflare_workers_custom_domain" "worker_domains" {
  for_each = var.worker_custom_domains

  account_id  = var.cloudflare_account_id
  zone_id     = var.zone_id
  service     = var.worker_service_name
  environment = var.worker_environment
  hostname    = each.value
}

resource "cloudflare_dns_record" "records" {
  for_each = var.dns_records

  zone_id  = var.zone_id
  name     = each.value.name
  type     = each.value.type
  content  = each.value.content
  ttl      = each.value.ttl
  proxied  = each.value.proxied
  comment  = each.value.comment
  priority = each.value.priority
}

output "worker_custom_domain_ids" {
  value       = { for k, d in cloudflare_workers_custom_domain.worker_domains : k => d.id }
  description = "Map of hostname -> Worker custom domain ID."
}

output "managed_dns_record_ids" {
  value       = { for k, r in cloudflare_dns_record.records : k => r.id }
  description = "Map of dns_records key -> Cloudflare DNS record ID."
}
