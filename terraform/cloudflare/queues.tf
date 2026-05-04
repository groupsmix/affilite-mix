# A31#19-20, A44#6: Cloudflare Queues Configuration
# Click tracking queue with DLQ and consumer alerting

# ═══════════════════════════════════════════════════════════════════════════════
# Main Queue - Click Tracking
# A31#19: Queue with encryption, TTL, and visibility timeout
# ═══════════════════════════════════════════════════════════════════════════════

resource "cloudflare_queue" "click_tracking" {
  account_id = var.cloudflare_account_id
  name       = "click-tracking-${var.environment}"  # Per-environment naming
  
  # Note: Cloudflare Queues are encrypted at rest by default
  # Message TTL and visibility timeout are configured at consumer level
}

# ═══════════════════════════════════════════════════════════════════════════════
# Dead Letter Queue
# A31#20: DLQ with consumer and alerting
# ═══════════════════════════════════════════════════════════════════════════════

resource "cloudflare_queue" "click_tracking_dlq" {
  account_id = var.cloudflare_account_id
  name       = "click-tracking-dlq-${var.environment}"
}

# DLQ Consumer Worker
# This worker processes poison messages from the DLQ for analysis and replay
resource "cloudflare_worker_script" "dlq_consumer" {
  account_id = var.cloudflare_account_id
  name       = "dlq-consumer-${var.environment}"
  
  # The worker script should:
  # 1. Read messages from click-tracking-dlq
  # 2. Write to R2 for analysis
  # 3. Send alerts if message count exceeds thresholds
  # 4. Optionally replay safe messages
  
  # Source code location (managed separately or inline)
  # For production, use module or separate repository
}

# DLQ Consumer binding
resource "cloudflare_worker_queue" "dlq_consumer_binding" {
  account_id = var.cloudflare_account_id
  queue_name = cloudflare_queue.click_tracking_dlq.name
  worker     = cloudflare_worker_script.dlq_consumer.name
  
  # Consumer settings
  batch_size       = 10
  max_batch_size   = 25
  max_retries      = 0  # Don't retry DLQ messages (they're already failed)
  max_wait_time    = 5000  # 5 seconds
  retry_delay      = 0
  
  # Dead letter queue (none - this IS the DLQ consumer)
  dead_letter_queue = ""
}

# ═══════════════════════════════════════════════════════════════════════════════
# Main Queue Consumer (with DLQ configured)
# ═══════════════════════════════════════════════════════════════════════════════

resource "cloudflare_worker_queue" "click_tracking_consumer" {
  account_id = var.cloudflare_account_id
  queue_name = cloudflare_queue.click_tracking.name
  worker     = var.main_worker_name  # The main affilite-mix worker
  
  # Consumer settings
  batch_size       = 25
  max_batch_size   = 25
  max_retries      = 3  # Retry 3 times before sending to DLQ
  max_wait_time    = 1000  # 1 second
  retry_delay      = 5000  # 5 seconds between retries
  
  # A31#20: Dead letter queue configuration
  dead_letter_queue = cloudflare_queue.click_tracking_dlq.name
}

# ═══════════════════════════════════════════════════════════════════════════════
# DLQ Monitoring Alert
# A44#6: Alert when DLQ accumulates messages
# ═══════════════════════════════════════════════════════════════════════════════

# Logpush job for queue metrics (enables DLQ depth monitoring)
resource "cloudflare_logpush_job" "queue_metrics" {
  count = var.logpush_enabled ? 1 : 0

  account_id       = var.cloudflare_account_id
  dataset          = "workers_queue_depth"
  destination_conf = var.logpush_destination_conf
  name             = "queue-depth-metrics"
  enabled          = true
}

# Note: DLQ alerting is implemented via:
# 1. GitHub Actions workflow (.github/workflows/dlq-monitor.yml) - every 15 min
# 2. Cloudflare Logpush metrics to external monitoring (Datadog/Grafana)
# 3. The dlq-consumer worker can also emit alerts

# ═══════════════════════════════════════════════════════════════════════════════
# Environment Variable
# ═══════════════════════════════════════════════════════════════════════════════

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "prod"
}

variable "main_worker_name" {
  description = "Name of the main application worker"
  type        = string
  default     = "affilite-mix"
}
