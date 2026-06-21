/**
 * RISK-OBS-01 (#586): Regression tests for production alerting validation.
 *
 * Ensures the deploy-time check correctly detects when alerting is
 * disabled or no notification destinations are wired.
 */
import { describe, it, expect } from "vitest";
// The script exports `validateAlertingConfigFromTfvars`; this test was
// written against the historical `validateAlertingConfig` name. Alias here
// so the regression coverage stays intact without renaming every call site.
import { validateAlertingConfigFromTfvars as validateAlertingConfig } from "../scripts/validate-alerting-config";

describe("validateAlertingConfig (#586)", () => {
  it("flags alerts_enabled = false as invalid", () => {
    const tfvars = `
alerts_enabled = false
alert_mechanisms = {
  email     = []
  pagerduty = []
  webhooks  = []
}`;
    const result = validateAlertingConfig(tfvars);
    expect(result.valid).toBe(false);
    expect(result.alertsEnabled).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e: string) => e.includes("alerts_enabled = false"))).toBe(true);
  });

  it("flags empty mechanisms as invalid even when enabled", () => {
    const tfvars = `
alerts_enabled = true
alert_mechanisms = {
  email     = []
  pagerduty = []
  webhooks  = []
}`;
    const result = validateAlertingConfig(tfvars);
    expect(result.valid).toBe(false);
    expect(result.alertsEnabled).toBe(true);
    expect(result.mechanismCount).toBe(0);
    expect(result.errors.some((e: string) => e.includes("zero destinations"))).toBe(true);
  });

  it("passes when alerting is enabled with at least one destination", () => {
    const tfvars = `
alerts_enabled = true
alert_mechanisms = {
  email     = [{ id = "abc123" }]
  pagerduty = []
  webhooks  = []
}`;
    const result = validateAlertingConfig(tfvars);
    expect(result.valid).toBe(true);
    expect(result.alertsEnabled).toBe(true);
    expect(result.mechanismCount).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it("counts multiple destinations across channels", () => {
    const tfvars = `
alerts_enabled = true
alert_mechanisms = {
  email     = [{ id = "e1" }, { id = "e2" }]
  pagerduty = [{ id = "pd1" }]
  webhooks  = [{ id = "wh1" }]
}`;
    const result = validateAlertingConfig(tfvars);
    expect(result.valid).toBe(true);
    expect(result.mechanismCount).toBe(4);
  });

  it("detects missing alerts_enabled key", () => {
    const tfvars = `
alert_mechanisms = {
  email     = [{ id = "abc" }]
  pagerduty = []
  webhooks  = []
}`;
    const result = validateAlertingConfig(tfvars);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes("not set"))).toBe(true);
  });

  it("a properly enabled alerting config validates (FR-12 contract)", () => {
    // FR-12 (2026-06-10): alerting was enabled after the OUT-1 incident ran
    // ~7h unnoticed overnight, to ensure production alerting stays on.
    //
    // T4-#11 untracked terraform/cloudflare/alerts.auto.tfvars (it carried a
    // personal email address and must not live in a public repo), so this test
    // no longer reads that file. The live "alerting cannot be silently disabled"
    // guarantee is enforced at deploy time: .github/workflows/deploy.yml runs
    // scripts/validate-alerting-config.ts (preferring TF_VAR_* env/secrets) and
    // hard-fails the production deploy (exit 1) unless the audit-logged
    // SKIP_ALERTING_CHECK override is set. This case keeps unit coverage of the
    // enabled-with-destination contract that the deploy gate depends on.
    const enabledConfig = `
alerts_enabled = true
alert_mechanisms = {
  email     = [{ id = "notification-destination-id" }]
  pagerduty = []
  webhooks  = []
}`;
    const result = validateAlertingConfig(enabledConfig);
    expect(result.valid).toBe(true);
    expect(result.alertsEnabled).toBe(true);
    expect(result.mechanismCount).toBeGreaterThanOrEqual(1);
    expect(result.errors).toHaveLength(0);
  });
});
