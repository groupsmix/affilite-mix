/**
 * RISK-OBS-01 (#586): Regression tests for production alerting validation.
 *
 * Ensures the deploy-time check correctly detects when alerting is
 * disabled or no notification destinations are wired.
 */
import { describe, it, expect } from "vitest";
import { validateAlertingConfig } from "../scripts/validate-alerting-config";

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
    expect(result.errors.some((e) => e.includes("alerts_enabled = false"))).toBe(true);
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
    expect(result.errors.some((e) => e.includes("zero destinations"))).toBe(true);
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
    expect(result.errors.some((e) => e.includes("not set"))).toBe(true);
  });

  it("current alerts.auto.tfvars has alerting disabled (documents the known gap)", () => {
    // This test documents the current state: alerting is disabled.
    // When alerting is properly configured, update this test to assert valid=true.
    const fs = require("node:fs");
    const path = require("node:path");
    const tfvarsPath = path.resolve(__dirname, "../terraform/cloudflare/alerts.auto.tfvars");
    const content = fs.readFileSync(tfvarsPath, "utf-8");
    const result = validateAlertingConfig(content);
    // Current state: alerting is disabled (alerts_enabled = false)
    expect(result.alertsEnabled).toBe(false);
  });
});
