/**
 * RISK-OBS-01 (#586) + F-01: Deploy-time validation for production alerting.
 *
 * Validates that Cloudflare alert mechanisms are properly configured before
 * allowing production deployment. Checks both terraform/cloudflare/alerts.auto.tfvars
 * (if present) and environment variables (TF_VAR_alert_mechanisms_*) to ensure
 * at least one notification destination is wired.
 *
 * Exit codes:
 *   0 — alerting is properly configured
 *   1 — alerting is disabled or mechanisms are empty
 *
 * Environment variables (alternative to tfvars file):
 *   TF_VAR_alert_mechanisms_email - JSON array of email destination IDs
 *   TF_VAR_alert_mechanisms_pagerduty - JSON array of PagerDuty destination IDs
 *   TF_VAR_alert_mechanisms_webhooks - JSON array of webhook destination IDs
 *   TF_VAR_alerts_enabled - Boolean to enable/disable alerts
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface AlertingValidation {
  valid: boolean;
  alertsEnabled: boolean;
  mechanismCount: number;
  errors: string[];
  source: "tfvars" | "env" | "none";
}

function parseEnvVar(varName: string): any {
  const value = process.env[varName];
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (e) {
    console.warn(`Warning: Failed to parse ${varName} as JSON`);
    return null;
  }
}

function countIds(obj: any): number {
  if (!Array.isArray(obj)) return 0;
  return obj.filter((item) => item && typeof item === "object" && item.id).length;
}

export function validateAlertingConfigFromEnv(): AlertingValidation {
  const errors: string[] = [];

  const alertsEnabledStr = process.env.TF_VAR_alerts_enabled;
  const alertsEnabled = alertsEnabledStr !== "false";

  if (!alertsEnabledStr) {
    errors.push("TF_VAR_alerts_enabled is not set");
  } else if (!alertsEnabled) {
    errors.push(
      "TF_VAR_alerts_enabled = false — production has zero alerting. " +
        "Set TF_VAR_alerts_enabled = true after configuring alert_mechanisms.",
    );
  }

  const emailDests = parseEnvVar("TF_VAR_alert_mechanisms_email") || [];
  const pagerdutyDests = parseEnvVar("TF_VAR_alert_mechanisms_pagerduty") || [];
  const webhookDests = parseEnvVar("TF_VAR_alert_mechanisms_webhooks") || [];

  const emailCount = countIds(emailDests);
  const pagerdutyCount = countIds(pagerdutyDests);
  const webhookCount = countIds(webhookDests);
  const mechanismCount = emailCount + pagerdutyCount + webhookCount;

  if (mechanismCount === 0) {
    errors.push(
      "TF_VAR_alert_mechanisms has zero destinations — SLO burn-rate alerts will not fire. " +
        "Add at least one email, pagerduty, or webhook destination ID via environment variables.",
    );
  }

  return {
    valid: alertsEnabled && mechanismCount > 0,
    alertsEnabled,
    mechanismCount,
    errors,
    source: "env",
  };
}

export function validateAlertingConfigFromTfvars(tfvarsContent: string): AlertingValidation {
  const errors: string[] = [];

  const enabledMatch = tfvarsContent.match(/alerts_enabled\s*=\s*(true|false)/);
  const alertsEnabled = enabledMatch?.[1] === "true";

  if (!enabledMatch) {
    errors.push("alerts_enabled is not set in tfvars file");
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
    source: "tfvars",
  };
}

if (require.main === module) {
  let result: AlertingValidation;
  let configSource = "";

  // First try environment variables (preferred for CI/CD)
  const hasEnvVars =
    process.env.TF_VAR_alerts_enabled ||
    process.env.TF_VAR_alert_mechanisms_email ||
    process.env.TF_VAR_alert_mechanisms_pagerduty ||
    process.env.TF_VAR_alert_mechanisms_webhooks;

  if (hasEnvVars) {
    result = validateAlertingConfigFromEnv();
    configSource = "environment variables";
  } else {
    // Fallback to tfvars file for local development
    const tfvarsPath = path.resolve(__dirname, "../terraform/cloudflare/alerts.auto.tfvars");

    if (!fs.existsSync(tfvarsPath)) {
      console.error(`[validate-alerting] ${tfvarsPath} not found`);
      console.error(`[validate-alerting] No environment variables set either`);
      console.error(`[validate-alerting] ❌ Production alerting is NOT configured`);
      console.error(``);
      console.error(
        `To fix: Set TF_VAR_alerts_enabled and at least one TF_VAR_alert_mechanisms_* variable`,
      );
      console.error(
        `  Or create terraform/cloudflare/alerts.auto.tfvars with your destination IDs`,
      );
      console.error(`  See terraform/cloudflare/alerts.tfvars.example for the expected format`);
      process.exit(1);
    }

    const content = fs.readFileSync(tfvarsPath, "utf-8");
    result = validateAlertingConfigFromTfvars(content);
    configSource = tfvarsPath;
  }

  if (!result.valid) {
    console.error("[validate-alerting] ❌ Production alerting is NOT configured:");
    console.error(`[validate-alerting] Source: ${configSource}`);
    console.error(`[validate-alerting] Alerts enabled: ${result.alertsEnabled}`);
    console.error(`[validate-alerting] Mechanisms configured: ${result.mechanismCount}`);
    for (const err of result.errors) {
      console.error(`  • ${err}`);
    }
    console.error(
      "\nTo fix: provision notification destinations in Cloudflare Dashboard → Notifications → Destinations,\n" +
        "then configure them via environment variables (TF_VAR_alert_mechanisms_*)\n" +
        "or in terraform/cloudflare/alerts.auto.tfvars.\n" +
        "See terraform/cloudflare/alerts.tfvars.example for the expected format.",
    );
    process.exit(1);
  }

  console.log(
    `[validate-alerting] ✅ Alerting configured via ${configSource}: ${result.mechanismCount} destination(s) wired.`,
  );
}
