/**
 * Tests for extended content-moderation functions added in audit remediation.
 * Covers: logModerationRejection, getModerationRejections, containsRegulatoryTerms,
 * moderateOutputExtended
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  logModerationRejection,
  getModerationRejections,
  containsRegulatoryTerms,
  moderateOutputExtended,
  moderateOutput,
} from "@/lib/ai/content-moderation";

describe("logModerationRejection", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("logs an event with required fields", () => {
    logModerationRejection("input", "test reason");
    const events = getModerationRejections();
    const last = events[events.length - 1];
    expect(last.action).toBe("ai_moderation_reject");
    expect(last.phase).toBe("input");
    expect(last.reason).toBe("test reason");
    expect(last.timestamp).toBeDefined();
  });

  it("includes optional context when provided", () => {
    logModerationRejection("output", "secret leak", {
      siteId: "site-123",
      topic: "test topic about watches",
    });
    const events = getModerationRejections();
    const last = events[events.length - 1];
    expect(last.siteId).toBe("site-123");
    expect(last.topic).toBe("test topic about watches");
  });

  it("truncates topic to 100 chars", () => {
    const longTopic = "a".repeat(200);
    logModerationRejection("input", "reason", { topic: longTopic });
    const events = getModerationRejections();
    const last = events[events.length - 1];
    expect(last.topic!.length).toBe(100);
  });

  it("emits structured console.warn", () => {
    logModerationRejection("input", "test");
    expect(console.warn).toHaveBeenCalledWith(
      "[ai_moderation_reject]",
      expect.stringContaining('"action":"ai_moderation_reject"'),
    );
  });
});

describe("containsRegulatoryTerms", () => {
  it("detects FDA approved", () => {
    const result = containsRegulatoryTerms("This product is FDA approved for home use");
    expect(result).toContain("FDA approved");
  });

  it("detects CE certified", () => {
    const result = containsRegulatoryTerms("CE certified device for EU markets");
    expect(result).toContain("CE certified");
  });

  it("detects ISO certified with number", () => {
    const result = containsRegulatoryTerms("ISO 9001 certified manufacturing");
    expect(result.some((t) => t.includes("ISO"))).toBe(true);
  });

  it("detects FTC recommended", () => {
    const result = containsRegulatoryTerms("This is FTC recommended for consumers");
    expect(result).toContain("FTC recommended");
  });

  it("detects clinically proven", () => {
    const result = containsRegulatoryTerms("clinically proven to reduce pain");
    expect(result).toContain("clinically proven");
  });

  it("detects patented", () => {
    const result = containsRegulatoryTerms("Our patented technology ensures quality");
    expect(result).toContain("patented");
  });

  it("detects UL listed", () => {
    const result = containsRegulatoryTerms("UL listed for electrical safety");
    expect(result).toContain("UL listed");
  });

  it("detects medical grade", () => {
    const result = containsRegulatoryTerms("medical grade stainless steel");
    expect(result).toContain("medical grade");
  });

  it("returns empty array when no terms found", () => {
    const result = containsRegulatoryTerms("A simple review about a nice watch with good features");
    expect(result).toHaveLength(0);
  });

  it("detects multiple terms", () => {
    const result = containsRegulatoryTerms(
      "FDA approved and CE certified product, clinically proven",
    );
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it("is case-insensitive", () => {
    const result = containsRegulatoryTerms("fda APPROVED product");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("moderateOutputExtended", () => {
  it("passes clean content without warnings", () => {
    const result = moderateOutputExtended(
      "A great watch review with nice features and good quality.",
    );
    expect(result.passed).toBe(true);
    expect(result.regulatoryWarnings).toBeUndefined();
  });

  it("passes but includes regulatory warnings when terms present", () => {
    const result = moderateOutputExtended(
      "This FDA approved watch is also CE certified for all markets.",
    );
    expect(result.passed).toBe(true);
    expect(result.regulatoryWarnings).toBeDefined();
    expect(result.regulatoryWarnings!.length).toBeGreaterThanOrEqual(2);
  });

  it("fails when prohibited content detected", () => {
    const result = moderateOutputExtended("Learn how to deploy ransomware to networks");
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("prohibited");
  });

  it("fails when secrets detected", () => {
    const result = moderateOutputExtended(
      "Use sk-abcdefghijklmnopqrstuvwxyz1234567890 for API access",
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("secrets");
  });
});
