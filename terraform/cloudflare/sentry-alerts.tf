# Sentry Alerting Rules (pseudo-terraform or JSON representation)
# These rules enforce the SLOs defined in docs/slo-definitions.md

# 1. High 5xx Burn Rate for Auth (Login, Reset)
# 2. High 5xx Burn Rate for Public Pages
# 3. High 5xx Burn Rate for Admin Panel
# 4. Click Tracking Failures
# 5. KV Rate Limit Fail-Open Alert

# To apply these rules, you would use the official Sentry Terraform provider.
# Example:
# resource "sentry_issue_alert" "kv_fail_open" {
#   organization = "my-org"
#   project      = "affilite-mix"
#   name         = "Rate Limiter KV Fail Open"
#   action_match = "any"
#   filter_match = "all"
#   frequency    = 30
#
#   conditions = [
#     {
#       id   = "sentry.rules.conditions.first_seen_event.FirstSeenEventCondition"
#       name = "A new issue is created"
#     }
#   ]
#
#   filters = [
#     {
#       id    = "sentry.rules.filters.event_attribute.EventAttributeFilter"
#       attribute = "context"
#       match     = "eq"
#       value     = "rate-limit.kv-unavailable-fail-open"
#     }
#   ]
#
#   actions = [
#     {
#       id        = "sentry.rules.actions.notify_event.NotifyEventAction"
#       name      = "Send a notification to Workspace"
#       targetType = "IssueOwners"
#       targetIdentifier = ""
#     }
#   ]
# }
