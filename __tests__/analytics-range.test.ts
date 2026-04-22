import { describe, it, expect } from "vitest";

import {
  DEFAULT_ANALYTICS_RANGE_PRESET,
  rangeLabel,
  resolveAnalyticsRange,
} from "@/lib/analytics/range";

const NOW = new Date("2025-06-15T12:00:00.000Z");

describe("resolveAnalyticsRange", () => {
  it("falls back to the 7d preset when range is missing", () => {
    const r = resolveAnalyticsRange({}, NOW);
    expect(r.preset).toBe(DEFAULT_ANALYTICS_RANGE_PRESET);
    expect(r.days).toBe(7);
    expect(r.toIso).toBe(NOW.toISOString());
    expect(r.fromIso).toBe(new Date("2025-06-08T12:00:00.000Z").toISOString());
  });

  it("falls back to 7d for unknown preset values", () => {
    const r = resolveAnalyticsRange({ range: "nonsense" }, NOW);
    expect(r.preset).toBe("7d");
  });

  it("supports the 24h preset", () => {
    const r = resolveAnalyticsRange({ range: "24h" }, NOW);
    expect(r.preset).toBe("24h");
    expect(r.days).toBe(1);
    expect(r.fromIso).toBe(new Date("2025-06-14T12:00:00.000Z").toISOString());
  });

  it("supports the 30d preset", () => {
    const r = resolveAnalyticsRange({ range: "30d" }, NOW);
    expect(r.preset).toBe("30d");
    expect(r.days).toBe(30);
    expect(r.fromIso).toBe(new Date("2025-05-16T12:00:00.000Z").toISOString());
  });

  it("accepts a valid custom range", () => {
    const from = "2025-05-01T00:00:00.000Z";
    const to = "2025-05-10T00:00:00.000Z";
    const r = resolveAnalyticsRange({ range: "custom", from, to }, NOW);
    expect(r.preset).toBe("custom");
    expect(r.fromIso).toBe(from);
    expect(r.toIso).toBe(to);
    expect(r.days).toBe(9);
  });

  it("falls back to the default preset if custom range is missing bounds", () => {
    const r = resolveAnalyticsRange({ range: "custom" }, NOW);
    expect(r.preset).toBe(DEFAULT_ANALYTICS_RANGE_PRESET);
  });

  it("falls back if custom range has from >= to", () => {
    const r = resolveAnalyticsRange(
      { range: "custom", from: "2025-06-01T00:00:00.000Z", to: "2025-05-01T00:00:00.000Z" },
      NOW,
    );
    expect(r.preset).toBe(DEFAULT_ANALYTICS_RANGE_PRESET);
  });

  it("unwraps array searchParam values (Next.js can pass string[] for repeated params)", () => {
    const r = resolveAnalyticsRange({ range: ["30d", "7d"] }, NOW);
    expect(r.preset).toBe("30d");
  });
});

describe("rangeLabel", () => {
  it("labels presets", () => {
    expect(rangeLabel(resolveAnalyticsRange({ range: "24h" }, NOW))).toBe("Last 24h");
    expect(rangeLabel(resolveAnalyticsRange({ range: "7d" }, NOW))).toBe("Last 7 days");
    expect(rangeLabel(resolveAnalyticsRange({ range: "30d" }, NOW))).toBe("Last 30 days");
  });

  it("labels custom ranges with ISO dates", () => {
    const r = resolveAnalyticsRange(
      { range: "custom", from: "2025-05-01T00:00:00.000Z", to: "2025-05-10T00:00:00.000Z" },
      NOW,
    );
    expect(rangeLabel(r)).toBe("2025-05-01 → 2025-05-10");
  });
});
