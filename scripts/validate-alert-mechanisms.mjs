#!/usr/bin/env node

/**
 * validate-alert-mechanisms.mjs
 * 
 * Validates that at least one Cloudflare alert mechanism is configured
 * before allowing Terraform to apply. This prevents the "silent alerting"
 * anti-pattern where alerts are defined in code but don't actually notify
 * anyone because notification destinations aren't wired.
 * 
 * Usage:
 *   node scripts/validate-alert-mechanisms.mjs [terraform-directory]
 * 
 * Environment variables:
 *   TF_VAR_alert_mechanisms_email - JSON array of email destination IDs
 *   TF_VAR_alert_mechanisms_pagerduty - JSON array of PagerDuty destination IDs
 *   TF_VAR_alert_mechanisms_webhooks - JSON array of webhook destination IDs
 *   TF_VAR_alerts_enabled - Boolean to enable/disable alerts
 * 
 * Exits with code 0 if validation passes, 1 if validation fails.
 */

function parseEnvVar(varName, defaultValue = []) {
  const value = process.env[varName];
  if (!value) return defaultValue;
  try {
    return JSON.parse(value);
  } catch (e) {
    console.warn(`Warning: Failed to parse ${varName} as JSON, using empty array`);
    return defaultValue;
  }
}

function validateAlertMechanisms() {
  const emailDests = parseEnvVar('TF_VAR_alert_mechanisms_email', []);
  const pagerdutyDests = parseEnvVar('TF_VAR_alert_mechanisms_pagerduty', []);
  const webhookDests = parseEnvVar('TF_VAR_alert_mechanisms_webhooks', []);
  const alertsEnabled = process.env.TF_VAR_alerts_enabled !== 'false';

  const totalMechanisms = emailDests.length + pagerdutyDests.length + webhookDests.length;

  console.log('Alert Mechanisms Validation:');
  console.log(`  Email destinations: ${emailDests.length}`);
  console.log(`  PagerDuty destinations: ${pagerdutyDests.length}`);
  console.log(`  Webhook destinations: ${webhookDests.length}`);
  console.log(`  Alerts enabled: ${alertsEnabled}`);

  if (!alertsEnabled) {
    console.log('✓ Alerts are disabled - validation skipped');
    return 0;
  }

  if (totalMechanisms === 0) {
    console.error('✗ VALIDATION FAILED: No alert mechanisms configured');
    console.error('');
    console.error('To fix this issue:');
    console.error('1. Configure at least one notification destination in Cloudflare Dashboard');
    console.error('2. Set the destination ID via environment variable or tfvars file:');
    console.error('   - TF_VAR_alert_mechanisms_email (JSON array)');
    console.error('   - TF_VAR_alert_mechanisms_pagerduty (JSON array)');
    console.error('   - TF_VAR_alert_mechanisms_webhooks (JSON array)');
    console.error('3. Or copy terraform/cloudflare/alerts.tfvars.example to alerts.tfvars');
    console.error('   and fill in your destination IDs');
    return 1;
  }

  console.log('✓ VALIDATION PASSED: At least one alert mechanism is configured');
  return 0;
}

// Run validation
const exitCode = validateAlertMechanisms();
process.exit(exitCode);