###############################################################################
# F-028: Cloudflare Queues — click-tracking pipeline + dead-letter queue.
#
# Mirrors the producer/consumer wiring declared in wrangler.jsonc:
#
#   wrangler.jsonc                                  IaC resource (this file)
#   ─────────────────────────────────────────────   ─────────────────────────
#   queues.producers[binding=CLICK_QUEUE].queue     cloudflare_queue.click_tracking
#   queues.consumers[].dead_letter_queue            cloudflare_queue.click_tracking_dlq
#
# Ownership boundary: Terraform owns the queues themselves. The worker's
# producer/consumer bindings stay in wrangler.jsonc because they are coupled
# to the Worker bundle's `queue()` handler (see workers/custom-worker.ts).
#
# Importing existing resources (one-time):
#
#   terraform import cloudflare_queue.click_tracking \
#     "${var.cloudflare_account_id}/<queue-id>"
#   terraform import cloudflare_queue.click_tracking_dlq \
#     "${var.cloudflare_account_id}/<queue-id>"
#
# Use `npx wrangler queues list` to discover the queue IDs.
###############################################################################

resource "cloudflare_queue" "click_tracking" {
  account_id = var.cloudflare_account_id
  queue_name = "click-tracking"
}

resource "cloudflare_queue" "click_tracking_dlq" {
  account_id = var.cloudflare_account_id
  queue_name = "click-tracking-dlq"
}

output "click_tracking_queue_id" {
  value       = cloudflare_queue.click_tracking.id
  description = "ID of the click-tracking queue (referenced by the CLICK_QUEUE producer binding)."
}

output "click_tracking_dlq_id" {
  value       = cloudflare_queue.click_tracking_dlq.id
  description = "ID of the click-tracking dead-letter queue."
}
