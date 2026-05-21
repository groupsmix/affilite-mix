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
    name     = string
    type     = string
    content  = string
    ttl      = optional(number, 1) # 1 = automatic
    proxied  = optional(bool, false)
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
    # SPF: authorise Resend as the only legitimate sender (~all = softfail,
    # tighten to -all after ≥30 days of clean DMARC aggregate reports).
    "spf" = {
      name    = "@"
      type    = "TXT"
      content = "v=spf1 include:_spf.resend.com ~all"
      ttl     = 300
      comment = "A144: SPF — authorises Resend. Tighten to -all after DMARC monitoring."
    }

    # DMARC: p=reject, 100% coverage, strict alignment, aggregate + forensic reports.
    # Replace zone_domain placeholder with your actual domain in tfvars.
    "dmarc" = {
      name    = "_dmarc"
      type    = "TXT"
      content = "v=DMARC1; p=reject; sp=reject; pct=100; adkim=s; aspf=s; fo=1"
      ttl     = 300
      comment = "A144: DMARC p=reject, 100% coverage. Add rua/ruf mailto: in tfvars."
    }

    # ── A145: DNS hardening ────────────────────────────────────────────
    # CAA: only Let's Encrypt may issue certificates for this zone.
    "caa-issue" = {
      name    = "@"
      type    = "CAA"
      content = "0 issue \"letsencrypt.org\""
      ttl     = 3600
      comment = "A145: CAA — restrict cert issuance to Let's Encrypt."
    }

    "caa-issuewild" = {
      name    = "@"
      type    = "CAA"
      content = "0 issuewild \";\""
      ttl     = 3600
      comment = "A145: CAA — block wildcard cert issuance from all CAs."
    }

    # MTA-STS discovery record — id= must change whenever the policy changes.
    "mta-sts" = {
      name    = "_mta-sts"
      type    = "TXT"
      content = "v=STSv1; id=20260515000000;"
      ttl     = 300
      comment = "A145: MTA-STS discovery. Update id= after every policy change."
    }

    # TLS-RPT: receive JSON reports when a sending MTA cannot establish TLS.
    "tls-rpt" = {
      name    = "_smtp._tls"
      type    = "TXT"
      content = "v=TLSRPTv1; rua=mailto:tls-reports@wristnerd.xyz"
      ttl     = 300
      comment = "A145: TLS-RPT — SMTP TLS failure reporting."
    }
  }
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
