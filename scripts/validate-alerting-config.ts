/**
 * RISK-OBS-01 (#586): Deploy-time validation for production alerting.
 *
 * Reads terraform/cloudflare/alerts.auto.tfvars and fails with a clear
 * message when alerting is disabled or no notification destinations are
 * wired. Intended to be called from the deploy pipeline so silent
 * "zero alerting" deployments are impossible.
 *
 * Exit codes:
 *   0 — alerting is properly configured
 *   1 — alerting is disabled or mechanisms are empty
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface AlertingValidation {
  valid: boolean;
  alertsEnabled: boolean;
  mechanismCount: number;
  errors: string[];
}

export function validateAlertingConfig(tfvarsContent: string): AlertingValidation {
  const errors: string[] = [];

  const enabledMatch = tfvarsContent.match(/alerts_enabled\s*=\s*(true|false)/);
  const alertsEnabled = enabledMatch?.[1] === "true";

  if (!enabledMatch) {
    errors.push("alerts_enabled is not set in alerts.auto.tfvars");
  } else if (!alertsEnabled) {
    errors.push(
      "alerts_enabled = false — production has zero alerting. " +
        "Set alerts_enabled = true after configuring alert_mechanisms.",
    );
  }

  const emailMatches = tfvarsContent.match(/email\s*=\s*\[([^\]]*)\]/);
  const pagerdutyMatches = tfvarsContent.match(/pagerduty\s*=\s*\[([^\]]*)\]/);
  const webhooksMatches = tfvarsContent.match(/webhooks\s*=\s*\[([^\]]*)\]/);

  const countIds = (match: RegExpMatchArray | null): number => {
    if (!match?.[1]) return 0;
    return (match[1].match(/id\s*=/g) ?? []).length;
  };

  const emailCount = countIds(emailMatches);
  const pagerdutyCount = countIds(pagerdutyMatches);
  const webhooksCount = countIds(webhooksMatches);
  const mechanismCount = emailCount + pagerdutyCount + webhooksCount;

  if (mechanismCount === 0) {
    errors.push(
      "alert_mechanisms has zero destinations — SLO burn-rate alerts will not fire. " +
        "Add at least one email, pagerduty, or webhook destination ID.",
    );
  }

  return {
    valid: alertsEnabled && mechanismCount > 0,
    alertsEnabled,
    mechanismCount,
    errors,
  };
}

if (require.main === module) {
  const tfvarsPath = path.resolve(__dirname, "../terraform/cloudflare/alerts.auto.tfvars");

  if (!fs.existsSync(tfvarsPath)) {
    console.error(`[validate-alerting] ${tfvarsPath} not found`);
    process.exit(1);
  }

  const content = fs.readFileSync(tfvarsPath, "utf-8");
  const result = validateAlertingConfig(content);

  if (!result.valid) {
    console.error("[validate-alerting] ❌ Production alerting is NOT wired:");
    for (const err of result.errors) {
      console.error(`  • ${err}`);
    }
    console.error(
      "\nTo fix: provision notification destinations in Cloudflare Dashboard → Notifications → Destinations,\n" +
        "then update terraform/cloudflare/alerts.auto.tfvars with their IDs.\n" +
        "See terraform/cloudflare/production.tfvars.example for the expected format.",
    );
    process.exit(1);
  }

  console.log(
    `[validate-alerting] ✅ Alerting configured: ${result.mechanismCount} destination(s) wired.`,
  );
}
