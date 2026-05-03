###############################################################################
# Sentry Alerting Rules
#
# These resources create Sentry issue alerts that enforce the SLOs defined in
# docs/slo-definitions.md and docs/slo.md. They use the official Sentry
# Terraform provider (https://registry.terraform.io/providers/jianyuan/sentry).
#
# Provider configuration lives in main.tf (sentry provider block). If the
# Sentry provider is not yet configured, these resources will be skipped by
# setting var.sentry_alerts_enabled = false.
###############################################################################

variable "sentry_alerts_enabled" {
  type        = bool
  default     = true
  description = "Whether to create Sentry alert resources. Set false if the Sentry Terraform provider is not configured."
}

variable "sentry_organization" {
  type        = string
  default     = ""
  description = "Sentry organization slug."
}

variable "sentry_project" {
  type        = string
  default     = ""
  description = "Sentry project slug (e.g. affilite-mix)."
}

# ── 1. Rate Limiter KV Fail-Open ─────────────────────────────────────

resource "sentry_issue_alert" "kv_fail_open" {
  count        = var.sentry_alerts_enabled ? 1 : 0
  organization = var.sentry_organization
  project      = var.sentry_project
  name         = "Rate Limiter KV Fail Open"

  action_match = "any"
  filter_match = "all"
  frequency    = 30

  conditions = <<-EOT
    [
      {
        "id": "sentry.rules.conditions.first_seen_event.FirstSeenEventCondition",
        "name": "A new issue is created"
      }
    ]
  EOT

  filters = <<-EOT
    [
      {
        "id": "sentry.rules.filters.tagged_event.TaggedEventFilter",
        "key": "context",
        "match": "eq",
        "value": "rate-limit.kv-unavailable-fail-open"
      }
    ]
  EOT

  actions = <<-EOT
    [
      {
        "id": "sentry.rules.actions.notify_event.NotifyEventAction",
        "name": "Send a notification to IssueOwners",
        "targetType": "IssueOwners",
        "targetIdentifier": ""
      }
    ]
  EOT
}

# ── 2. High 5xx Error Rate (Public Pages) ────────────────────────────

resource "sentry_issue_alert" "high_5xx_public" {
  count        = var.sentry_alerts_enabled ? 1 : 0
  organization = var.sentry_organization
  project      = var.sentry_project
  name         = "High 5xx Burn Rate - Public Pages"

  action_match = "any"
  filter_match = "all"
  frequency    = 5

  conditions = <<-EOT
    [
      {
        "id": "sentry.rules.conditions.event_frequency.EventFrequencyCondition",
        "interval": "5m",
        "value": 50,
        "name": "The issue is seen more than 50 times in 5m"
      }
    ]
  EOT

  filters = <<-EOT
    [
      {
        "id": "sentry.rules.filters.tagged_event.TaggedEventFilter",
        "key": "http.status_code",
        "match": "gte",
        "value": "500"
      }
    ]
  EOT

  actions = <<-EOT
    [
      {
        "id": "sentry.rules.actions.notify_event.NotifyEventAction",
        "name": "Send a notification to IssueOwners",
        "targetType": "IssueOwners",
        "targetIdentifier": ""
      }
    ]
  EOT
}

# ── 3. High 5xx Error Rate (Admin Panel) ─────────────────────────────

resource "sentry_issue_alert" "high_5xx_admin" {
  count        = var.sentry_alerts_enabled ? 1 : 0
  organization = var.sentry_organization
  project      = var.sentry_project
  name         = "High 5xx Burn Rate - Admin Panel"

  action_match = "any"
  filter_match = "all"
  frequency    = 5

  conditions = <<-EOT
    [
      {
        "id": "sentry.rules.conditions.event_frequency.EventFrequencyCondition",
        "interval": "5m",
        "value": 20,
        "name": "The issue is seen more than 20 times in 5m"
      }
    ]
  EOT

  filters = <<-EOT
    [
      {
        "id": "sentry.rules.filters.tagged_event.TaggedEventFilter",
        "key": "transaction",
        "match": "co",
        "value": "/api/admin"
      }
    ]
  EOT

  actions = <<-EOT
    [
      {
        "id": "sentry.rules.actions.notify_event.NotifyEventAction",
        "name": "Send a notification to IssueOwners",
        "targetType": "IssueOwners",
        "targetIdentifier": ""
      }
    ]
  EOT
}

# ── 4. Click Tracking Failures ───────────────────────────────────────

resource "sentry_issue_alert" "click_tracking_failures" {
  count        = var.sentry_alerts_enabled ? 1 : 0
  organization = var.sentry_organization
  project      = var.sentry_project
  name         = "Click Tracking Failures"

  action_match = "any"
  filter_match = "all"
  frequency    = 10

  conditions = <<-EOT
    [
      {
        "id": "sentry.rules.conditions.event_frequency.EventFrequencyCondition",
        "interval": "1m",
        "value": 10,
        "name": "The issue is seen more than 10 times in 1m"
      }
    ]
  EOT

  filters = <<-EOT
    [
      {
        "id": "sentry.rules.filters.tagged_event.TaggedEventFilter",
        "key": "transaction",
        "match": "co",
        "value": "/api/track/click"
      }
    ]
  EOT

  actions = <<-EOT
    [
      {
        "id": "sentry.rules.actions.notify_event.NotifyEventAction",
        "name": "Send a notification to IssueOwners",
        "targetType": "IssueOwners",
        "targetIdentifier": ""
      }
    ]
  EOT
}

# ── 5. DLQ Depth Alert ───────────────────────────────────────────────

resource "sentry_issue_alert" "dlq_depth" {
  count        = var.sentry_alerts_enabled ? 1 : 0
  organization = var.sentry_organization
  project      = var.sentry_project
  name         = "DLQ Depth > 0"

  action_match = "any"
  filter_match = "all"
  frequency    = 60

  conditions = <<-EOT
    [
      {
        "id": "sentry.rules.conditions.first_seen_event.FirstSeenEventCondition",
        "name": "A new issue is created"
      }
    ]
  EOT

  filters = <<-EOT
    [
      {
        "id": "sentry.rules.filters.tagged_event.TaggedEventFilter",
        "key": "context",
        "match": "eq",
        "value": "queue.dlq.non-empty"
      }
    ]
  EOT

  actions = <<-EOT
    [
      {
        "id": "sentry.rules.actions.notify_event.NotifyEventAction",
        "name": "Send a notification to IssueOwners",
        "targetType": "IssueOwners",
        "targetIdentifier": ""
      }
    ]
  EOT
}

# ── 6. Cron Heartbeat Missed ─────────────────────────────────────────

resource "sentry_issue_alert" "cron_heartbeat_missed" {
  count        = var.sentry_alerts_enabled ? 1 : 0
  organization = var.sentry_organization
  project      = var.sentry_project
  name         = "Cron Heartbeat Missed"

  action_match = "any"
  filter_match = "all"
  frequency    = 60

  conditions = <<-EOT
    [
      {
        "id": "sentry.rules.conditions.first_seen_event.FirstSeenEventCondition",
        "name": "A new issue is created"
      }
    ]
  EOT

  filters = <<-EOT
    [
      {
        "id": "sentry.rules.filters.tagged_event.TaggedEventFilter",
        "key": "context",
        "match": "eq",
        "value": "cron.heartbeat.missed"
      }
    ]
  EOT

  actions = <<-EOT
    [
      {
        "id": "sentry.rules.actions.notify_event.NotifyEventAction",
        "name": "Send a notification to IssueOwners",
        "targetType": "IssueOwners",
        "targetIdentifier": ""
      }
    ]
  EOT
}

# ── 7. AI Cost Threshold ─────────────────────────────────────────────

resource "sentry_issue_alert" "ai_cost_threshold" {
  count        = var.sentry_alerts_enabled ? 1 : 0
  organization = var.sentry_organization
  project      = var.sentry_project
  name         = "AI Cost Threshold Exceeded"

  action_match = "any"
  filter_match = "all"
  frequency    = 1440

  conditions = <<-EOT
    [
      {
        "id": "sentry.rules.conditions.first_seen_event.FirstSeenEventCondition",
        "name": "A new issue is created"
      }
    ]
  EOT

  filters = <<-EOT
    [
      {
        "id": "sentry.rules.filters.tagged_event.TaggedEventFilter",
        "key": "context",
        "match": "eq",
        "value": "ai.cost.threshold-exceeded"
      }
    ]
  EOT

  actions = <<-EOT
    [
      {
        "id": "sentry.rules.actions.notify_event.NotifyEventAction",
        "name": "Send a notification to IssueOwners",
        "targetType": "IssueOwners",
        "targetIdentifier": ""
      }
    ]
  EOT
}
