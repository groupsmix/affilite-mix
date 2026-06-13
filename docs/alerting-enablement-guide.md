# Production Alerting Enablement Guide

**Audit Finding:** E2-03 — Production alerting is disabled (policies exist, switch is OFF)
**Related Finding:** E2-12 — Observability has no evidence of queue-depth / DLQ-rate SLO alerting wired to a destination

## Overview

The affilite-mix platform has comprehensive alerting infrastructure defined in Terraform (`terraform/cloudflare/alerts.tf`), including:

- Worker 5xx burn rate alerts
- Worker CPU time alerts
- Billing/usage alerts
- **Queue backlog alerts** (addresses E2-12)

However, the alerts are currently disabled because:

1. No notification destinations are configured
2. The `alerts_enabled` flag is set to `false`

## Current State

**Infrastructure:** ✅ Complete

- Terraform resources defined for all alert types
- Queue backlog alerts already implemented (E2-12)
- Lifecycle preconditions prevent enabling without destinations

**Configuration:** ❌ Missing

- `terraform/cloudflare/alerts.auto.tfvars` does not exist
- No email, PagerDuty, or webhook destinations configured
- `alerts_enabled = false`

## Remediation Steps

### Step 1: Create Notification Destinations

1. **Go to Cloudflare Dashboard**
   - Navigate to: https://dash.cloudflare.com
   - Go to: Notifications → Destinations

2. **Create at least one destination**

   **Option A: Email (Quick Start)**
   - Click "Create" → "Email"
   - Add your on-call email address
   - Copy the destination ID (e.g., `abc123def456`)

   **Option B: PagerDuty (Recommended for Production)**
   - Click "Create" → "PagerDuty"
   - Configure your PagerDuty integration
   - Copy the integration ID

   **Option C: Webhook (For Slack/Teams)**
   - Click "Create" → "Webhook"
   - Configure your webhook URL
   - Copy the webhook ID

### Step 2: Configure Terraform Variables

1. **Copy the example file:**

   ```bash
   cp terraform/cloudflare/alerts.tfvars.example terraform/cloudflare/alerts.auto.tfvars
   ```

2. **Edit `terraform/cloudflare/alerts.auto.tfvars`:**

   Uncomment and configure at least one destination:

   ```hcl
   alert_mechanisms = {
     # Example for email:
     email = [
       { id = "your-destination-id-from-step-1" }
     ]

     pagerduty = []
     webhooks = []
   }
   ```

3. **Enable alerts:**
   ```hcl
   alerts_enabled = true
   ```

### Step 3: Apply Terraform Changes

1. **Navigate to Terraform directory:**

   ```bash
   cd terraform/cloudflare
   ```

2. **Initialize and apply:**

   ```bash
   terraform init
   terraform plan
   terraform apply
   ```

   The lifecycle precondition will fail if `alerts_enabled = true` but no destinations are configured.

### Step 4: Verify Alert Delivery

1. **Fire a test alert:**

   ```bash
   ./scripts/fire-test-alert.sh
   ```

2. **Confirm receipt:**
   - Check your email/PagerDuty/Slack for the test alert
   - Verify the alert contains the expected information

3. **Test queue backlog alert (E2-12):**
   - The queue backlog alert is already configured in `alerts.tf`
   - It triggers when queue depth exceeds `queue_backlog_alert_threshold` (default: 1000)
   - Monitor Cloudflare Dashboard → Workers → Queues to verify

## Ongoing Maintenance

### Quarterly Tasks

1. **Test alert delivery:** Run `./scripts/fire-test-alert.sh`
2. **Review destination configurations:** Ensure on-call rotation is current
3. **Verify alert thresholds:** Adjust based on traffic patterns
4. **Update runbooks:** Ensure incident response procedures are current

### When On-Call Changes

1. Update email/PagerDuty destinations in Cloudflare Dashboard
2. Update destination IDs in `terraform/cloudflare/alerts.auto.tfvars`
3. Run `terraform apply` to propagate changes

### When Traffic Patterns Change

1. Monitor queue depth patterns in Cloudflare Dashboard
2. Adjust `queue_backlog_alert_threshold` in tfvars if needed
3. Adjust billing threshold based on actual spend patterns
4. Run `terraform apply` to propagate changes

## Alert Types Implemented

### Worker Health Alerts (E2-03)

1. **Worker 5xx Burn Rate Alert**
   - Triggers when 5xx error rate exceeds 5% over 5 minutes
   - Indicates worker health issues or deployment problems
   - Alert type: `http_alert_edge_error`

2. **Worker High CPU Time Alert**
   - Triggers when worker consistently hits CPU limits
   - Indicates potential latency SLO breaches
   - Alert type: `http_alert_edge_error`

### Cost Protection Alerts (E2-03)

3. **Billing Usage Alert**
   - Triggers when daily spend exceeds threshold (default: $100)
   - Prevents cost overruns
   - Alert type: `billing_usage_alert`

### Queue Monitoring Alerts (E2-12) ✅

4. **Queue Backlog Burn Rate Alert**
   - Triggers when click-tracking queue depth exceeds threshold (default: 1000)
   - Addresses E2-12: queue-depth monitoring
   - Indicates consumer lag or failure
   - Alert type: `http_alert_edge_error`

**Note:** E2-12 also requested DLQ-rate and Stripe-webhook-failure alerts.

1. **DLQ-rate alerts:** Can be added as additional notification policies in `terraform/cloudflare/alerts.tf` following the same pattern as the existing queue backlog alert.

2. **Sentry-based alerts (Future Enhancement):** The file `terraform/cloudflare/sentry-alerts.tf` contains pseudo-terraform definitions for additional Sentry-based alerts including:
   - DLQ depth > 0 alert (already partially covered by Cloudflare queue backlog alert)
   - Cron heartbeat missed alert
   - Stripe webhook failure alerts
   - AI cost threshold alerts

   These are currently commented out and would require:
   - Adding the Sentry Terraform provider
   - Configuring Sentry auth tokens
   - Converting pseudo-code to actual Terraform resources

   Consider implementing Sentry-based alerts for more granular monitoring as a follow-up to E2-12.

## Troubleshooting

### Terraform Apply Fails with "alerts_enabled = true requires at least one entry"

**Cause:** You set `alerts_enabled = true` but didn't configure any destinations.

**Solution:** Configure at least one destination in `alert_mechanisms` before enabling alerts.

### Test Alert Not Received

**Cause:** Destination ID is incorrect or destination is misconfigured.

**Solution:**

1. Verify destination ID in Cloudflare Dashboard
2. Check destination configuration (email address, webhook URL, etc.)
3. Check Cloudflare Dashboard → Notifications → History for delivery failures

### Queue Backlog Alert Not Triggering

**Cause:** Queue depth hasn't exceeded threshold, or queue consumer isn't emitting metrics.

**Solution:**

1. Check actual queue depth in Cloudflare Dashboard
2. Verify queue consumer is running and healthy
3. Lower `queue_backlog_alert_threshold` temporarily for testing
4. Check worker logs for metric emission

## Security Considerations

- `alerts.auto.tfvars` is in `.gitignore` to prevent committing sensitive destination IDs
- Never commit destination IDs to the repository
- Use separate destinations for staging vs production environments
- Rotate webhook secrets if using webhook destinations
- Review destination access permissions quarterly

## References

- Terraform Configuration: `terraform/cloudflare/alerts.tf`
- Example Configuration: `terraform/cloudflare/alerts.tfvars.example`
- Test Script: `scripts/fire-test-alert.sh`
- Cloudflare Documentation: https://developers.cloudflare.com/notifications/get-started/
- Related Audit Findings: E2-03, E2-12
