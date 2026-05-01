resource "cloudflare_healthcheck" "apac_health" {
  zone_id = var.cloudflare_zone_id
  name = "apac-health"
  address = "https://groupsmix.com/api/health"
  type = "HTTPS" port = 443 method = "GET"
  expected_codes = ["200"]
  check_regions = ["SIN","TPE","NRT"]
  interval = 60
}
