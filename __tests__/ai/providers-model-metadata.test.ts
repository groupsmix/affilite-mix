import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Tests: generateWithFallback returns both provider name and model id ─────

describe("generateWithFallback returns model metadata", () => {
  const originals: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of [
      "CLOUDFLARE_ACCOUNT_ID",
      "CLOUDFLARE_AI_API_TOKEN",
      "GEMINI_API_KEY",
      "GROQ_API_KEY",
      "COHERE_API_KEY",
      "AI_ENABLE_CLOUDFLARE",
      "AI_ENABLE_GEMINI",
      "AI_ENABLE_GROQ",
      "AI_ENABLE_COHERE",
    ]) {
      originals[k] = process.env[k];
      delete process.env[k];
    }
    vi.restoreAllMocks();
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(originals)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("includes a non-empty model string when Gemini succeeds", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.AI_ENABLE_GEMINI = "true";

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "hello" }] } }],
        }),
        { status: 200 },
      ),
    );

    const { generateWithFallback } = await import("@/lib/ai/providers");
    const result = await generateWithFallback("hi");

    expect(result.text).toBe("hello");
    expect(result.provider).toBe("Google Gemini");
    expect(result.model).toBe("gemini-1.5-flash");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("records the Groq model when Gemini is unavailable but Groq succeeds", async () => {
    process.env.GROQ_API_KEY = "test-key";
    process.env.AI_ENABLE_GROQ = "true";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "hi from groq" } }] }), {
        status: 200,
      }),
    );

    const { generateWithFallback } = await import("@/lib/ai/providers");
    const result = await generateWithFallback("hi");

    expect(result.provider).toBe("Groq");
    expect(result.model).toBe("llama-3.1-8b-instant");
  });
});
