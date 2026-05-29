/**
 * Tests for lib/ai/output-validation.ts
 * Covers: validateOutputFormat, checkContentQuality, validateGeneratedLinks
 */
import { describe, it, expect } from "vitest";

import {
  validateOutputFormat,
  checkContentQuality,
  validateGeneratedLinks,
} from "@/lib/ai/output-validation";

describe("validateOutputFormat", () => {
  it("rejects empty response", () => {
    const result = validateOutputFormat("");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Empty response");
  });

  it("rejects whitespace-only response", () => {
    const result = validateOutputFormat("   \n\n  ");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Empty response");
  });

  it("rejects response shorter than 500 chars", () => {
    const result = validateOutputFormat("TITLE: Short\nEXCERPT: Too short\nBody content");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("too short");
  });

  it("rejects response without TITLE: prefix", () => {
    const body = "A".repeat(600);
    const result = validateOutputFormat(`EXCERPT: Some excerpt\n${body}`);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("TITLE:");
  });

  it("rejects response without EXCERPT: prefix", () => {
    const body = "A".repeat(600);
    const result = validateOutputFormat(`TITLE: Some title\n${body}`);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("EXCERPT:");
  });

  it("accepts valid response with correct format", () => {
    const body = "A".repeat(600);
    const response = `TITLE: Best Watches 2025\nEXCERPT: A guide to watches\nMETA_TITLE: Watches\nMETA_DESC: Guide\n${body}`;
    const result = validateOutputFormat(response);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("accepts when TITLE and EXCERPT appear within first 15 lines", () => {
    const padding = Array(5).fill("some preamble line").join("\n");
    const body = "A".repeat(600);
    const response = `${padding}\nTITLE: Delayed Title\nEXCERPT: Delayed Excerpt\n${body}`;
    const result = validateOutputFormat(response);
    expect(result.valid).toBe(true);
  });
});

describe("checkContentQuality", () => {
  it("passes when word count is >= 800", () => {
    const body = Array(850).fill("word").join(" ");
    const result = checkContentQuality(body);
    expect(result.passed).toBe(true);
    expect(result.wordCount).toBe(850);
    expect(result.warnings).toHaveLength(0);
  });

  it("fails when word count is below 800", () => {
    const body = Array(500).fill("word").join(" ");
    const result = checkContentQuality(body);
    expect(result.passed).toBe(false);
    expect(result.wordCount).toBe(500);
    expect(result.warnings[0]).toContain("below minimum 800");
  });

  it("checks keyword presence", () => {
    const body = Array(850).fill("word").join(" ") + " watches luxury";
    const result = checkContentQuality(body, ["watches", "luxury", "missing-kw"]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("missing-kw")]),
    );
  });

  it("passes keyword check when all keywords present", () => {
    const body = Array(850).fill("word").join(" ") + " watches luxury premium";
    const result = checkContentQuality(body, ["watches", "luxury", "premium"]);
    expect(result.passed).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("handles empty keywords array", () => {
    const body = Array(850).fill("word").join(" ");
    const result = checkContentQuality(body, []);
    expect(result.passed).toBe(true);
  });

  it("handles undefined keywords", () => {
    const body = Array(850).fill("word").join(" ");
    const result = checkContentQuality(body);
    expect(result.passed).toBe(true);
  });
});

describe("validateGeneratedLinks", () => {
  it("passes when no links present", () => {
    const result = validateGeneratedLinks("<p>No links here</p>");
    expect(result.valid).toBe(true);
    expect(result.totalLinks).toBe(0);
    expect(result.flaggedDomains).toHaveLength(0);
  });

  it("passes for relative links", () => {
    const result = validateGeneratedLinks('<a href="/products/watch">Watch</a>');
    expect(result.valid).toBe(true);
    expect(result.totalLinks).toBe(1);
  });

  it("passes for anchor links", () => {
    const result = validateGeneratedLinks('<a href="#section">Jump</a>');
    expect(result.valid).toBe(true);
  });

  it("passes for mailto links", () => {
    const result = validateGeneratedLinks('<a href="mailto:test@example.com">Email</a>');
    expect(result.valid).toBe(true);
  });

  it("passes for allowed domains (Amazon)", () => {
    const result = validateGeneratedLinks('<a href="https://www.amazon.com/product/123">Buy</a>');
    expect(result.valid).toBe(true);
  });

  it("passes for allowed domains (Wikipedia)", () => {
    const result = validateGeneratedLinks('<a href="https://en.wikipedia.org/wiki/Watch">Wiki</a>');
    expect(result.valid).toBe(true);
  });

  it("flags unknown domains", () => {
    const result = validateGeneratedLinks(
      '<a href="https://evil-phishing.example.com/steal">Click here</a>',
    );
    expect(result.valid).toBe(false);
    expect(result.flaggedDomains).toContain("evil-phishing.example.com");
  });

  it("flags multiple unknown domains and deduplicates", () => {
    const html = `
      <a href="https://evil.com/1">Link 1</a>
      <a href="https://evil.com/2">Link 2</a>
      <a href="https://bad-site.org/x">Link 3</a>
    `;
    const result = validateGeneratedLinks(html);
    expect(result.valid).toBe(false);
    expect(result.flaggedDomains).toContain("evil.com");
    expect(result.flaggedDomains).toContain("bad-site.org");
    // Deduplicated
    expect(result.flaggedDomains.filter((d) => d === "evil.com")).toHaveLength(1);
  });

  it("flags malformed URLs", () => {
    const result = validateGeneratedLinks('<a href="https://:invalid">Bad</a>');
    expect(result.valid).toBe(false);
  });

  it("respects AI_ALLOWED_LINK_DOMAINS env var", () => {
    process.env.AI_ALLOWED_LINK_DOMAINS = "mysite.com,partner.example.com";
    const result = validateGeneratedLinks(
      '<a href="https://mysite.com/page">Link</a><a href="https://sub.partner.example.com/x">Link2</a>',
    );
    expect(result.valid).toBe(true);
    delete process.env.AI_ALLOWED_LINK_DOMAINS;
  });

  it("passes for YouTube links", () => {
    const result = validateGeneratedLinks(
      '<a href="https://www.youtube.com/watch?v=abc123">Video</a>',
    );
    expect(result.valid).toBe(true);
  });
});
