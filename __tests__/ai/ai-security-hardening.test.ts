/**
 * A103-A115 audit fix: AI security hardening tests.
 *
 * Covers:
 *   - A107-1: Global AI kill switch (isAIEnabled / AIDisabledError)
 *   - A103:   Cloudflare account ID SSRF guard
 *   - A107:   Model version pinning (dated snapshots)
 *   - A108:   Anti-phishing rule in system prompt preamble
 *   - A112:   External URL detection in content moderation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── A107-1: Global AI kill switch ──────────────────────────────────

describe("isAIEnabled (A107-1 kill switch)", () => {
  const origAiEnabled = process.env.AI_ENABLED;

  afterEach(() => {
    if (origAiEnabled === undefined) delete process.env.AI_ENABLED;
    else process.env.AI_ENABLED = origAiEnabled;
  });

  it("returns true by default when AI_ENABLED is unset", async () => {
    delete process.env.AI_ENABLED;
    const { isAIEnabled } = await import("@/lib/ai/providers");
    expect(isAIEnabled()).toBe(true);
  });

  it('returns false when AI_ENABLED is "false"', async () => {
    process.env.AI_ENABLED = "false";
    const { isAIEnabled } = await import("@/lib/ai/providers");
    expect(isAIEnabled()).toBe(false);
  });

  it('returns false when AI_ENABLED is "0"', async () => {
    process.env.AI_ENABLED = "0";
    const { isAIEnabled } = await import("@/lib/ai/providers");
    expect(isAIEnabled()).toBe(false);
  });

  it('returns true when AI_ENABLED is "true"', async () => {
    process.env.AI_ENABLED = "true";
    const { isAIEnabled } = await import("@/lib/ai/providers");
    expect(isAIEnabled()).toBe(true);
  });

  it('returns true when AI_ENABLED is "1"', async () => {
    process.env.AI_ENABLED = "1";
    const { isAIEnabled } = await import("@/lib/ai/providers");
    expect(isAIEnabled()).toBe(true);
  });
});

describe("generateWithFallback respects kill switch", () => {
  const envKeys = [
    "AI_ENABLED",
    "GEMINI_API_KEY",
    "AI_ENABLE_GEMINI",
    "GROQ_API_KEY",
    "AI_ENABLE_GROQ",
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_AI_API_TOKEN",
    "AI_ENABLE_CLOUDFLARE",
    "COHERE_API_KEY",
    "AI_ENABLE_COHERE",
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of envKeys) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    vi.restoreAllMocks();
  });

  afterEach(() => {
    for (const k of envKeys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("throws AIDisabledError when AI_ENABLED=false", async () => {
    process.env.AI_ENABLED = "false";
    process.env.GEMINI_API_KEY = "test";
    process.env.AI_ENABLE_GEMINI = "true";

    const { generateWithFallback, AIDisabledError } = await import("@/lib/ai/providers");
    await expect(generateWithFallback("test prompt")).rejects.toBeInstanceOf(AIDisabledError);
  });
});

// ── A108: Anti-phishing rule in system prompt ──────────────────────

describe("system prompt hardening preamble (A108/A112)", () => {
  it("contains anti-phishing/anti-URL rule", async () => {
    const { SYSTEM_PROMPT_HARDENING_PREAMBLE } = await import("@/lib/ai/prompt-sanitization");
    expect(SYSTEM_PROMPT_HARDENING_PREAMBLE.toLowerCase()).toContain("external url");
    expect(SYSTEM_PROMPT_HARDENING_PREAMBLE.toLowerCase()).toContain("hyperlink");
  });

  it("assembleSystemPrompt includes the anti-phishing preamble", async () => {
    const { assembleSystemPrompt } = await import("@/lib/ai/prompt-sanitization");
    const result = assembleSystemPrompt("Write an article");
    expect(result.toLowerCase()).toContain("external url");
  });
});

// ── A112: External URL detection in content moderation ─────────────

describe("containsExternalUrls (A112)", () => {
  it("detects https URLs in output", async () => {
    const { containsExternalUrls } = await import("@/lib/ai/content-moderation");
    expect(containsExternalUrls("Visit https://evil.example.com/phishing for more")).toBe(true);
  });

  it("detects http URLs in output", async () => {
    const { containsExternalUrls } = await import("@/lib/ai/content-moderation");
    expect(containsExternalUrls("Click http://malware.test/payload")).toBe(true);
  });

  it("passes clean content without URLs", async () => {
    const { containsExternalUrls } = await import("@/lib/ai/content-moderation");
    expect(containsExternalUrls("This is a great product with excellent build quality.")).toBe(
      false,
    );
  });

  it("passes empty string", async () => {
    const { containsExternalUrls } = await import("@/lib/ai/content-moderation");
    expect(containsExternalUrls("")).toBe(false);
  });
});

describe("moderateOutput rejects external URLs (A112)", () => {
  it("fails output containing phishing URLs", async () => {
    const { moderateOutput } = await import("@/lib/ai/content-moderation");
    const result = moderateOutput(
      "Great product! Visit https://evil.example.com/steal-credentials to buy.",
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("external URL");
  });
});

// ── A107: Model version pinning ────────────────────────────────────

describe("model version pinning (A107)", () => {
  it("all providers use pinned/dated model identifiers", async () => {
    // Import the provider list indirectly via getAvailableProviders
    // can't directly access ALL_PROVIDERS, but we can verify via
    // static analysis that the source file contains pinned versions.
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../lib/ai/providers.ts"),
      "utf-8",
    );

    // Gemini should be pinned to a dated snapshot (e.g. gemini-1.5-flash-002)
    expect(source).toContain("gemini-1.5-flash-002");
    // Cohere should be pinned
    expect(source).toContain("command-r-08-2024");
    // Cloudflare model is inherently pinned by the full path
    expect(source).toContain("@cf/meta/llama-3.1-8b-instruct");
  });
});

// ── A103: Cloudflare account ID SSRF guard ─────────────────────────

describe("Cloudflare account ID validation (A103 SSRF guard)", () => {
  it("source code validates account ID format before URL construction", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../lib/ai/providers.ts"),
      "utf-8",
    );

    // Verify the regex validation exists
    expect(source).toContain("[a-f0-9]{32}");
    expect(source).toContain("refusing to construct URL");
  });
});

// ── A108: Audit event logging for cron AI generation ───────────────

describe("cron/ai-generate audit logging (A108)", () => {
  it("cron route imports recordAuditEvent", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../app/api/cron/ai-generate/route.ts"),
      "utf-8",
    );

    expect(source).toContain("recordAuditEvent");
    expect(source).toContain("cron/ai-generate");
  });
});

// ── A107-1: .env.example documents AI_ENABLED ──────────────────────

describe("AI_ENABLED documented in .env.example", () => {
  it(".env.example contains AI_ENABLED with kill-switch documentation", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const envExample = fs.readFileSync(
      path.resolve(__dirname, "../../.env.example"),
      "utf-8",
    );

    expect(envExample).toContain("AI_ENABLED");
    expect(envExample).toContain("kill switch");
  });
});
