import { describe, it, expect, beforeEach, afterEach } from "vitest";

const AI_ENV_KEYS = [
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_AI_API_TOKEN",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "COHERE_API_KEY",
  "AI_ENABLE_CLOUDFLARE",
  "AI_ENABLE_GEMINI",
  "AI_ENABLE_GROQ",
  "AI_ENABLE_COHERE",
] as const;

describe("AI provider feature flags", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of AI_ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of AI_ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("lists no providers when credentials exist but AI_ENABLE_* flags are unset", async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "acct";
    process.env.CLOUDFLARE_AI_API_TOKEN = "tok";
    process.env.GEMINI_API_KEY = "g";
    process.env.GROQ_API_KEY = "gr";
    process.env.COHERE_API_KEY = "c";

    const { getAvailableProviders } = await import("@/lib/ai/providers");
    expect(getAvailableProviders()).toEqual([]);
  });

  it("lists only providers whose credentials AND AI_ENABLE_* flag are both set", async () => {
    process.env.GEMINI_API_KEY = "g";
    process.env.AI_ENABLE_GEMINI = "true";
    process.env.GROQ_API_KEY = "gr";
    // Groq flag intentionally omitted.

    const { getAvailableProviders } = await import("@/lib/ai/providers");
    expect(getAvailableProviders()).toEqual(["Google Gemini"]);
  });

  it('treats AI_ENABLE_* = "1" as enabled', async () => {
    process.env.COHERE_API_KEY = "c";
    process.env.AI_ENABLE_COHERE = "1";

    const { getAvailableProviders } = await import("@/lib/ai/providers");
    expect(getAvailableProviders()).toEqual(["Cohere"]);
  });

  it('treats AI_ENABLE_* = "false" or any non-truthy value as disabled', async () => {
    process.env.GEMINI_API_KEY = "g";
    process.env.AI_ENABLE_GEMINI = "false";

    const { getAvailableProviders } = await import("@/lib/ai/providers");
    expect(getAvailableProviders()).toEqual([]);
  });

  it("disables a provider when the flag is set but credentials are missing", async () => {
    process.env.AI_ENABLE_GEMINI = "true";
    // GEMINI_API_KEY intentionally omitted.

    const { getAvailableProviders } = await import("@/lib/ai/providers");
    expect(getAvailableProviders()).toEqual([]);
  });
});
