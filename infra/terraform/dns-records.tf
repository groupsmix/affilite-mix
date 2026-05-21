# OF-25: SPF / DMARC / CAA managed in IaC.
resource "cloudflare_record" "spf" {
  zone_id = var.cloudflare_zone_id
  name    = "@"
  type    = "TXT"
  value   = "v=spf1 include:_spf.resend.com -all"
  ttl     = 3600
}
resource "cloudflare_record" "dmarc" {
  zone_id = var.cloudflare_zone_id
  name    = "_dmarc"
  type    = "TXT"
  value   = "v=DMARC1; p=reject; rua=mailto:dmarc-reports@groupsmix.com; adkim=s; aspf=s"
  ttl     = 3600
}
