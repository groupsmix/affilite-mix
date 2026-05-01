resource "cloudflare_ruleset" "ofac_block" {
  zone_id = var.cloudflare_zone_id
  name = "ofac-hard-block"
  kind = "zone"
  phase = "http_request_firewall_custom"
  rules { action = "block" expression = "(ip.geoip.country in {\"IR\" \"KP\" \"SY\" \"CU\"})" enabled = true }
}
