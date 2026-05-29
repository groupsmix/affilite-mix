# ┌──────────────────────────────────────────────────────────────────────────┐
# │ DEPRECATED — Season 8 CEO audit finding F5 (A249-M1)                   │
# │                                                                        │
# │ These resources duplicate SPF/DMARC records that are now managed in    │
# │ the canonical Terraform tree: terraform/cloudflare/dns.tf              │
# │                                                                        │
# │ This file previously targeted the groupsmix.com zone while             │
# │ terraform/cloudflare/dns.tf targeted wristnerd.xyz, creating two       │
# │ sources of truth for DNS — a drift and SOX change-management risk.     │
# │                                                                        │
# │ Migration plan:                                                        │
# │   1. Import existing groupsmix.com DNS records into                    │
# │      terraform/cloudflare/dns.tf (add a second zone_id variable or     │
# │      workspace per domain).                                            │
# │   2. `terraform state rm` the resources below from this state file.    │
# │   3. Delete this file.                                                 │
# │                                                                        │
# │ Until step 1–3 are complete, these resources remain to avoid           │
# │ accidental deletion of live DNS records. DO NOT modify them here —     │
# │ all DNS changes go through terraform/cloudflare/dns.tf.               │
# └──────────────────────────────────────────────────────────────────────────┘

# DEPRECATED: use terraform/cloudflare/dns.tf "spf" record instead.
resource "cloudflare_record" "spf" {
  zone_id = var.cloudflare_zone_id
  name    = "@"
  type    = "TXT"
  value   = "v=spf1 include:_spf.resend.com -all"
  ttl     = 3600
}

# DEPRECATED: use terraform/cloudflare/dns.tf "dmarc" record instead.
resource "cloudflare_record" "dmarc" {
  zone_id = var.cloudflare_zone_id
  name    = "_dmarc"
  type    = "TXT"
  value   = "v=DMARC1; p=reject; rua=mailto:dmarc-reports@groupsmix.com; adkim=s; aspf=s"
  ttl     = 3600
}
