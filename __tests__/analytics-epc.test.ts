import { describe, expect, it } from "vitest";

import {
  DEFAULT_EST_REVENUE_PER_CLICK,
  resolveEstimatedRevenuePerClick,
} from "@/lib/analytics/epc";

describe("resolveEstimatedRevenuePerClick", () => {
  it("prefers the static site config value when present", () => {
    expect(
      resolveEstimatedRevenuePerClick({
        siteConfig: { estRevenuePerClick: 0.62 },
        dbSite: { est_revenue_per_click: 0.41 },
      }),
    ).toBe(0.62);
  });

  it("falls back to the database value when config is missing", () => {
    expect(
      resolveEstimatedRevenuePerClick({
        siteConfig: undefined,
        dbSite: { est_revenue_per_click: 0.41 },
      }),
    ).toBe(0.41);
  });

  it("falls back to the default constant when neither source provides a value", () => {
    expect(
      resolveEstimatedRevenuePerClick({
        siteConfig: undefined,
        dbSite: undefined,
      }),
    ).toBe(DEFAULT_EST_REVENUE_PER_CLICK);
  });

  it("treats nullish inputs as missing and still reaches the default", () => {
    expect(
      resolveEstimatedRevenuePerClick({
        siteConfig: null,
        dbSite: null,
      }),
    ).toBe(DEFAULT_EST_REVENUE_PER_CLICK);
  });
});
