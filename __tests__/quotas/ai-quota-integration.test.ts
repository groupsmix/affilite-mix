/**
 * AI provider × per-tenant quota integration (G-42).
 *
 * Confirms that `generateWithFallback` rejects when a tenant is over
 * its `ai_requests` ceiling AND that quota accounting fires after a
 * successful call.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

interface MockKVEntry {
  value: string;
}

function makeMockKV(): { kv: Record<string, MockKVEntry>; binding: unknown } {
  const kv: Record<string, MockKVEntry> = {};
  const binding = {
    async get(key: string, type?: string) {
      const entry = kv[key];
      if (!entry) return null;
      if (type === "json") return JSON.parse(entry.value);
      return entry.value;
    },
    async put(key: string, value: string) {
      kv[key] = { value };
    },
  };
  return { kv, binding };
}

describe("generateWithFallback × per-tenant quotas", () => {
  const aiKeys = [
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_AI_API_TOKEN",
    "GEMINI_API_KEY",
    "GROQ_API_KEY",
    "COHERE_API_KEY",
    "AI_ENABLE_CLOUDFLARE",
    "AI_ENABLE_GEMINI",
    "AI_ENABLE_GROQ",
    "AI_ENABLE_COHERE",
    "QUOTA_DEFAULT_AI_REQUESTS_PER_DAY",
    "QUOTA_DEFAULT_AI_TOKENS_PER_MONTH",
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.resetModules();
    for (const k of aiKeys) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of aiKeys) {
      const v = saved[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("throws QuotaExceededError before contacting any provider when over the daily ceiling", async () => {
    process.env.QUOTA_DEFAULT_AI_REQUESTS_PER_DAY = "0";
    process.env.GEMINI_API_KEY = "test";
    process.env.AI_ENABLE_GEMINI = "true";

    const { binding } = makeMockKV();
    vi.stubGlobal("RATE_LIMIT_KV", binding);

    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { generateWithFallback } = await import("@/lib/ai/providers");
    const { QuotaExceededError } = await import("@/lib/quotas");

    await expect(
      generateWithFallback("hi", undefined, { siteId: "site-x" }),
    ).rejects.toBeInstanceOf(QuotaExceededError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records request + token usage after a successful generation", async () => {
    process.env.GEMINI_API_KEY = "test";
    process.env.AI_ENABLE_GEMINI = "true";

    const { kv, binding } = makeMockKV();
    vi.stubGlobal("RATE_LIMIT_KV", binding);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "hello world" }] } }],
        }),
        { status: 200 },
      ),
    );

    const { generateWithFallback } = await import("@/lib/ai/providers");
    const result = await generateWithFallback("a prompt that is long enough", undefined, {
      siteId: "site-x",
    });
    expect(result.text).toBe("hello world");

    // Drain the fire-and-forget recording promises.
    await new Promise((r) => setTimeout(r, 20));

    const requestKey = Object.keys(kv).find((k) => k.startsWith("quota:site-x:ai_requests:"));
    expect(requestKey).toBeDefined();
    expect(JSON.parse(kv[requestKey!]!.value).count).toBe(1);

    const tokenKey = Object.keys(kv).find((k) => k.startsWith("quota:site-x:ai_tokens:"));
    expect(tokenKey).toBeDefined();
    expect(JSON.parse(kv[tokenKey!]!.value).count).toBeGreaterThan(0);
  });

  it("does NOT charge quota when siteId is not supplied (legacy callers)", async () => {
    process.env.GEMINI_API_KEY = "test";
    process.env.AI_ENABLE_GEMINI = "true";
    process.env.QUOTA_DEFAULT_AI_REQUESTS_PER_DAY = "0";

    const { kv, binding } = makeMockKV();
    vi.stubGlobal("RATE_LIMIT_KV", binding);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "ok" }] } }],
        }),
        { status: 200 },
      ),
    );

    const { generateWithFallback } = await import("@/lib/ai/providers");
    const out = await generateWithFallback("hi");
    expect(out.text).toBe("ok");
    expect(Object.keys(kv).filter((k) => k.startsWith("quota:")).length).toBe(0);
  });
});
