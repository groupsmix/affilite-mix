alerts_enabled = true

alert_mechanisms = {
  # FR-12 (2026-06-10): enabled after the OUT-1 incident ran ~7h unnoticed.
  # Cloudflare email mechanisms use the address itself as the destination id.
  email     = [{ id = "professional.inbox.simo@gmail.com" }]
  pagerduty = []
  webhooks  = []
}
