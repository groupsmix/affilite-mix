# ═══════════════════════════════════════════════════════════════════════════════
# Affilite-Mix — Cloudflare Infrastructure as Code
#
# Provisions: KV namespace, R2 bucket, DNS records, Worker custom domains,
# cron triggers, WAF/rate-limit rules, and edge security controls.
#
# The Worker script itself is deployed via the CI/CD pipeline (opennextjs-cloudflare),
# not via Terraform. Terraform manages the surrounding infrastructure only.
# ═══════════════════════════════════════════════════════════════════════════════

# ─── KV Namespace (rate limiting) ─────────────────────────────────────────────
resource "cloudflare_workers_kv_namespace" "rate_limit" {
  account_id = var.cloudflare_account_id
  title      = "${var.worker_name}-rate-limit-${var.environment}"
}

# ─── R2 Bucket (ISR cache) ───────────────────────────────────────────────────
resource "cloudflare_r2_bucket" "isr_cache" {
  account_id = var.cloudflare_account_id
  name       = "next-inc-cache-${var.environment}"
  location   = "WNAM"
}

# ─── DNS: Wildcard CNAME for dynamic subdomains ─────────────────────────────
resource "cloudflare_record" "wildcard_cname" {
  zone_id = var.zone_id
  name    = "*"
  content = "${var.worker_name}.${var.domain}"
  type    = "CNAME"
  proxied = true
  ttl     = 1 # Auto (proxied)
  comment = "Managed by Terraform — wildcard routing for dynamic niche sites"
}

# ─── DNS: Apex A record (required for root domain) ──────────────────────────
resource "cloudflare_record" "apex" {
  zone_id = var.zone_id
  name    = "@"
  content = "192.0.2.1" # Dummy IP — Cloudflare proxied mode handles routing
  type    = "A"
  proxied = true
  ttl     = 1
  comment = "Managed by Terraform — apex domain routing"
}

# ─── Worker Custom Domain Bindings ───────────────────────────────────────────
resource "cloudflare_worker_domain" "custom" {
  for_each   = toset(var.custom_domains)
  account_id = var.cloudflare_account_id
  zone_id    = var.zone_id
  hostname   = each.value
  service    = var.worker_name
}

# ─── WAF / Rate Limiting / Edge Security ────────────────────────────────────
# See waf.tf for full rule definitions.

# ─── Outputs ─────────────────────────────────────────────────────────────────
output "kv_namespace_id" {
  description = "KV namespace ID — update wrangler.jsonc with this value."
  value       = cloudflare_workers_kv_namespace.rate_limit.id
}

output "r2_bucket_name" {
  description = "R2 bucket name for ISR cache."
  value       = cloudflare_r2_bucket.isr_cache.name
}

output "custom_domain_hostnames" {
  description = "Worker custom domain bindings."
  value       = [for d in cloudflare_worker_domain.custom : d.hostname]
}
