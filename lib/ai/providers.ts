/**
 * AI Provider abstraction with fallback chain.
 *
 * Order: Cloudflare AI → Google Gemini → Groq → Cohere
 * Each provider is tried in sequence; if one fails or hits rate limits,
 * the next one is used automatically.
 */

import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { assembleSystemPrompt, sanitizePrompt } from "./prompt-sanitization";
import {
  assertQuota,
  costToMicroUsd,
  estimateTokens,
  recordUsage,
  QuotaExceededError,
} from "@/lib/quotas";

export interface AIProvider {
  name: string;
  /** Model identifier used by this provider (recorded alongside generations) */
  model: string;
  generate(prompt: string, systemPrompt?: string): Promise<string>;
  isAvailable(): boolean;
  /**
   * Cost in micro-USD per 1k input/output tokens. Used by the
   * per-tenant quota tracker (G-42, `lib/quotas.ts`). Provider classes
   * carry this metadata so the price table lives in one place.
   *
   * Set to 0 for providers that don't bill per-token (Cloudflare AI on
   * Workers Free is effectively free at our scale).
   */
  pricing: { inputMicroUsdPer1k: number; outputMicroUsdPer1k: number };
}

interface ProviderConfig {
  cloudflareAccountId?: string;
  cloudflareApiToken?: string;
  geminiApiKey?: string;
  groqApiKey?: string;
  cohereApiKey?: string;
}

function getProviderConfig(): ProviderConfig {
  return {
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareApiToken: process.env.CLOUDFLARE_AI_API_TOKEN,
    geminiApiKey: process.env.GEMINI_API_KEY,
    groqApiKey: process.env.GROQ_API_KEY,
    cohereApiKey: process.env.COHERE_API_KEY,
  };
}

/**
 * Per-provider on/off feature flag. A provider is considered available only
 * when its credentials are present AND its `AI_ENABLE_*` flag is truthy —
 * just having the env key set is not enough. This lets operators
 * selectively disable a provider without having to unset its credentials.
 *
 * Truthy values: "true" (case-insensitive) or "1". Anything else (including
 * unset) is treated as disabled.
 */
function isProviderFlagEnabled(flagName: string): boolean {
  const raw = process.env[flagName];
  if (!raw) return false;
  return raw.toLowerCase() === "true" || raw === "1";
}

/* ------------------------------------------------------------------ */
/*  Cloudflare AI Provider                                             */
/* ------------------------------------------------------------------ */

class CloudflareAIProvider implements AIProvider {
  name = "Cloudflare AI";
  model = "@cf/meta/llama-3.1-8b-instruct";
  // Cloudflare Workers AI is included in the Workers plan; we attribute
  // a token cost of zero so the per-tenant cost ceiling tracks only
  // metered upstream calls (Gemini / Groq / Cohere).
  pricing = { inputMicroUsdPer1k: 0, outputMicroUsdPer1k: 0 };

  isAvailable(): boolean {
    const cfg = getProviderConfig();
    return (
      Boolean(cfg.cloudflareAccountId && cfg.cloudflareApiToken) &&
      isProviderFlagEnabled("AI_ENABLE_CLOUDFLARE")
    );
  }

  async generate(prompt: string, systemPrompt?: string): Promise<string> {
    const cfg = getProviderConfig();
    const url = `https://api.cloudflare.com/client/v4/accounts/${cfg.cloudflareAccountId}/ai/run/${this.model}`;

    const messages: { role: string; content: string }[] = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.cloudflareApiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages, max_tokens: 4096 }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Cloudflare AI error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as { result?: { response?: string } };
    const response = data.result?.response;
    if (!response) throw new Error("Cloudflare AI returned empty response");
    return response;
  }
}

/* ------------------------------------------------------------------ */
/*  Google Gemini Provider                                             */
/* ------------------------------------------------------------------ */

class GeminiProvider implements AIProvider {
  name = "Google Gemini";
  model = "gemini-1.5-flash";
  // gemini-1.5-flash list price (≤128k context) — keep in sync with
  // https://ai.google.dev/gemini-api/docs/pricing.
  pricing = { inputMicroUsdPer1k: 75, outputMicroUsdPer1k: 300 };

  isAvailable(): boolean {
    return Boolean(getProviderConfig().geminiApiKey) && isProviderFlagEnabled("AI_ENABLE_GEMINI");
  }

  async generate(prompt: string, systemPrompt?: string): Promise<string> {
    const cfg = getProviderConfig();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;

    const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": cfg.geminiApiKey!,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: { maxOutputTokens: 4096 },
      }),
      timeoutMs: 15000,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gemini error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini returned empty response");
    return text;
  }
}

/* ------------------------------------------------------------------ */
/*  Groq Provider                                                      */
/* ------------------------------------------------------------------ */

class GroqProvider implements AIProvider {
  name = "Groq";
  model = "llama-3.1-8b-instant";
  // Groq llama-3.1-8b-instant list price; see https://groq.com/pricing/.
  pricing = { inputMicroUsdPer1k: 50, outputMicroUsdPer1k: 80 };

  isAvailable(): boolean {
    return Boolean(getProviderConfig().groqApiKey) && isProviderFlagEnabled("AI_ENABLE_GROQ");
  }

  async generate(prompt: string, systemPrompt?: string): Promise<string> {
    const cfg = getProviderConfig();
    const url = "https://api.groq.com/openai/v1/chat/completions";

    const messages: { role: string; content: string }[] = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.groqApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: 4096,
      }),
      timeoutMs: 15000,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Groq error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Groq returned empty response");
    return content;
  }
}

/* ------------------------------------------------------------------ */
/*  Cohere Provider                                                    */
/* ------------------------------------------------------------------ */

class CohereProvider implements AIProvider {
  name = "Cohere";
  model = "command-r";
  // Cohere command-r list price; see https://cohere.com/pricing.
  pricing = { inputMicroUsdPer1k: 150, outputMicroUsdPer1k: 600 };

  isAvailable(): boolean {
    return Boolean(getProviderConfig().cohereApiKey) && isProviderFlagEnabled("AI_ENABLE_COHERE");
  }

  async generate(prompt: string, systemPrompt?: string): Promise<string> {
    const cfg = getProviderConfig();
    const url = "https://api.cohere.com/v2/chat";

    const messages: { role: string; content: string }[] = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.cohereApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: 4096,
      }),
      timeoutMs: 15000,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Cohere error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      message?: { content?: { text?: string }[] };
    };
    const text = data.message?.content?.[0]?.text;
    if (!text) throw new Error("Cohere returned empty response");
    return text;
  }
}

/* ------------------------------------------------------------------ */
/*  Fallback chain                                                     */
/* ------------------------------------------------------------------ */

/** All providers in fallback order */
const ALL_PROVIDERS: AIProvider[] = [
  new CloudflareAIProvider(),
  new GeminiProvider(),
  new GroqProvider(),
  new CohereProvider(),
];

/**
 * Optional generation context. When `siteId` is provided, the per-tenant
 * quota primitives (`lib/quotas.ts`, audit G-42) gate the call:
 *
 *   1. Pre-flight: reject when `ai_requests` for today or the estimated
 *      `ai_tokens` for this month would push the tenant over its ceiling.
 *      Throws `QuotaExceededError`.
 *   2. Post-flight: record the actual prompt + completion token counts
 *      and the resolved cost (in micro-USD). Recording is fire-and-forget
 *      so a KV write failure never breaks the generation path.
 *
 * When `siteId` is omitted (legacy callers, internal tooling), no quota
 * accounting happens — preserves existing behaviour.
 */
export interface GenerateOptions {
  /** Tenant whose quota the call should be charged against. */
  siteId?: string;
}

/**
 * Try each provider in order until one succeeds.
 * Throws if all providers fail.
 *
 * Prompt-injection guard (LIVE-18): both the user prompt and system
 * prompt are passed through `sanitizePrompt` / `assembleSystemPrompt`
 * BEFORE we hit the provider fallback loop. This ensures the same
 * length cap, control-token strip, and hardening preamble are
 * applied to every provider regardless of which one wins the chain.
 * See `lib/ai/prompt-sanitization.ts`.
 *
 * Per-tenant quotas (G-42): when `options.siteId` is supplied, the
 * call is gated by `lib/quotas.ts` and may throw `QuotaExceededError`
 * before any provider is contacted.
 */
export async function generateWithFallback(
  prompt: string,
  systemPrompt?: string,
  options: GenerateOptions = {},
): Promise<{ text: string; provider: string; model: string }> {
  const safePrompt = sanitizePrompt(prompt);
  const safeSystemPrompt = assembleSystemPrompt(systemPrompt);

  const inputTokenEstimate = estimateTokens(safePrompt) + estimateTokens(safeSystemPrompt ?? "");

  if (options.siteId) {
    // Pre-flight ceilings. Throw QuotaExceededError so callers can render
    // a friendly 429 / admin notice. We deliberately check both counters
    // up-front: a single AI call can blow the daily request limit OR the
    // monthly token limit, and we want callers to see the more specific
    // signal first.
    await assertQuota(options.siteId, "ai_requests", 1);
    if (inputTokenEstimate > 0) {
      await assertQuota(options.siteId, "ai_tokens", inputTokenEstimate);
    }
  }

  const errors: string[] = [];

  for (const provider of ALL_PROVIDERS) {
    if (!provider.isAvailable()) {
      errors.push(`${provider.name}: not configured`);
      continue;
    }

    try {
      const text = await provider.generate(safePrompt, safeSystemPrompt);
      if (options.siteId) {
        // F-25: Await usage accounting to prevent cost-accounting drift.
        // If recording fails, log a warning but don't fail the generation
        // so users aren't blocked by infrastructure issues.
        const outputTokenEstimate = estimateTokens(text);
        const totalTokens = inputTokenEstimate + outputTokenEstimate;
        const microUsd =
          Math.ceil((inputTokenEstimate * provider.pricing.inputMicroUsdPer1k) / 1000) +
          Math.ceil((outputTokenEstimate * provider.pricing.outputMicroUsdPer1k) / 1000);
        try {
          await Promise.allSettled([
            recordUsage(options.siteId, "ai_requests", 1),
            totalTokens > 0
              ? recordUsage(options.siteId, "ai_tokens", totalTokens)
              : Promise.resolve(),
            microUsd > 0
              ? recordUsage(options.siteId, "ai_cost_micro_usd", costToMicroUsd(microUsd / 1_000_000))
              : Promise.resolve(),
          ]);
        } catch {
          // F-25: Log but don't throw — accounting failures must never break generation
        }
      }
      return { text, provider: provider.name, model: provider.model };
    } catch (err) {
      // QuotaExceededError must propagate immediately — we don't want to
      // try the next provider when the limit, not the upstream, is the
      // problem.
      if (err instanceof QuotaExceededError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${provider.name}: ${msg}`);
    }
  }

  // F-26: Normalize provider errors to internal codes. Log full diagnostics
  // server-side but expose only a generic message to callers.
  const internalError = new Error("AI generation unavailable: all providers failed");
  (internalError as any).providerErrors = errors; // Available to server-side logging
  throw internalError;
}

/** Get list of available (configured) providers */
export function getAvailableProviders(): string[] {
  return ALL_PROVIDERS.filter((p) => p.isAvailable()).map((p) => p.name);
}
