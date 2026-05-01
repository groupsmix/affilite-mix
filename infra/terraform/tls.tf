# OF-29: prefer TLS 1.3 only at edge.
resource "cloudflare_zone_settings_override" "tls13" {
  zone_id = var.cloudflare_zone_id
  settings {
    min_tls_version = "1.3"
    tls_1_3         = "on"
    automatic_https_rewrites = "on"
  }
}
