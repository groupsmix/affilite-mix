# OF-25: SPF / DMARC / CAA managed in IaC.
resource "cloudflare_record" "spf" {
  zone_id = var.cloudflare_zone_id
  name    = "@"
  type    = "TXT"
  value   = "v=spf1 include:_spf.resend.com -all"
  ttl     = 3600
}
