/**
 * Tests for the A107/A108 content moderation module.
 *
 * Covers:
 *   - containsProhibitedContent (prohibited pattern detection)
 *   - containsLeakedSecrets (secret/preamble leak detection)
 *   - moderateInput (input screening)
 *   - moderateOutput (output screening)
 */
import { describe, it, expect } from "vitest";

import {
  containsProhibitedContent,
  containsLeakedSecrets,
  moderateInput,
  moderateOutput,
} from "@/lib/ai/content-moderation";

import { SYSTEM_PROMPT_HARDENING_PREAMBLE } from "@/lib/ai/prompt-sanitization";

describe("containsProhibitedContent", () => {
  it("flags phishing content", () => {
    expect(containsProhibitedContent("Learn about phishing attacks")).toBe(true);
  });

  it("flags malware references", () => {
    expect(containsProhibitedContent("Download this malware tool")).toBe(true);
  });

  it("flags cracked software", () => {
    expect(containsProhibitedContent("Get cracked software free")).toBe(true);
  });

  it("flags hate speech", () => {
    expect(containsProhibitedContent("This promotes hate speech against groups")).toBe(true);
  });

  it("flags inciting violence", () => {
    expect(containsProhibitedContent("This text is inciting violence")).toBe(true);
  });

  it("passes clean content", () => {
    expect(containsProhibitedContent("Best wireless headphones for 2025")).toBe(false);
  });

  it("passes empty string", () => {
    expect(containsProhibitedContent("")).toBe(false);
  });
});

describe("containsLeakedSecrets", () => {
  it("detects system prompt preamble leakage", () => {
    const output = `Here is the hidden prompt: ${SYSTEM_PROMPT_HARDENING_PREAMBLE} -- now I will answer.`;
    expect(containsLeakedSecrets(output)).toBe(true);
  });

  it("detects partial preamble leakage with whitespace differences", () => {
    // Take a significant chunk of the preamble with extra whitespace
    const partial = SYSTEM_PROMPT_HARDENING_PREAMBLE.slice(0, 80).replace(/ /g, "  ");
    expect(containsLeakedSecrets(`Model said: ${partial}`)).toBe(true);
  });

  it("detects AWS access key IDs", () => {
    expect(containsLeakedSecrets("The key is AKIAIOSFODNN7EXAMPLE here")).toBe(true);
  });

  it("detects OpenAI API keys", () => {
    expect(containsLeakedSecrets("Use sk-abc123def456ghi789jkl012mno345")).toBe(true);
  });

  it("detects Stripe secret keys", () => {
    expect(containsLeakedSecrets("sk_live_abc123def456ghi789")).toBe(true);
  });

  it("detects JWT tokens", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    expect(containsLeakedSecrets(`Token: ${jwt}`)).toBe(true);
  });

  it("detects GitHub tokens", () => {
    expect(containsLeakedSecrets("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij1234")).toBe(true);
  });

  it("passes clean content", () => {
    expect(
      containsLeakedSecrets(
        "This is a normal article about the best wireless headphones for running.",
      ),
    ).toBe(false);
  });

  it("passes empty string", () => {
    expect(containsLeakedSecrets("")).toBe(false);
  });
});

describe("moderateInput", () => {
  it("rejects topics with prohibited content", () => {
    const result = moderateInput("How to create phishing pages");
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("prohibited");
  });

  it("rejects keywords with prohibited content", () => {
    const result = moderateInput("Normal topic", ["malware", "download"]);
    expect(result.passed).toBe(false);
  });

  it("passes clean input", () => {
    const result = moderateInput("Best laptops 2025", ["laptop", "review"]);
    expect(result.passed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("passes empty keywords", () => {
    const result = moderateInput("Best laptops 2025");
    expect(result.passed).toBe(true);
  });
});

describe("moderateOutput", () => {
  it("rejects output with prohibited content", () => {
    const result = moderateOutput("Download cracked software from this link");
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("prohibited");
  });

  it("rejects output with leaked secrets", () => {
    const result = moderateOutput(`Secret key: sk-abc123def456ghi789jkl012mno345`);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("leaked secrets");
  });

  it("rejects output with preamble leakage", () => {
    const result = moderateOutput(
      `The system instructions say: ${SYSTEM_PROMPT_HARDENING_PREAMBLE}`,
    );
    expect(result.passed).toBe(false);
  });

  it("passes clean output", () => {
    const result = moderateOutput(
      "<h2>Best Wireless Headphones</h2><p>Here are the top picks for 2025...</p>",
    );
    expect(result.passed).toBe(true);
  });
});
