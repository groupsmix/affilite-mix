/**
 * AI Provider abstraction with fallback chain.
 *
 * Order: Cloudflare AI → Google Gemini → Groq → Cohere
 * Each provider is tried in sequence; if one fails or hits rate limits,
 * the next one is used automatically.
 */

import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { logger } from "@/lib/logger";
import { assembleSystemPrompt, sanitizePrompt } from "./prompt-sanitization";
import { getCircuitBreaker } from "@/lib/ai/circuit-breaker";
import {
  reserveQuota,
  releaseQuota,
  estimateTokens,
  recordUsage,
  QuotaExceededError,
} from "@/lib/quotas";

interface AIProvider {
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
      // R2-05: Redact upstream response body to prevent leaking provider diagnostics
      throw new Error(`Cloudflare AI error: status=${res.status}`);
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
  // A107-F1: Pin to explicit versioned model ID to prevent silent drift.
  model = "gemini-1.5-flash-002";
  // gemini-1.5-flash list price (≤128k context) — keep in sync with
  // https://ai.google.dev/gemini-api/docs/pricing.
  pricing = { inputMicroUsdPer1k: 75, outputMicroUsdPer1k: 300 };

  isAvailable(): boolean {
    return Boolean(getProviderConfig().geminiApiKey) && isProviderFlagEnabled("AI_ENABLE_GEMINI");
  }

  async generate(prompt: string, systemPrompt?: string): Promise<string> {
    const cfg = getProviderConfig();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-002:generateContent`;

    // A101-F2: Use Gemini's native system_instruction parameter instead of
    // concatenating system+user into a single turn. This preserves proper
    // role separation so user input cannot escape the system prompt boundary.
    const requestBody: Record<string, unknown> = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 4096 },
    };
    if (systemPrompt) {
      requestBody.system_instruction = { parts: [{ text: systemPrompt }] };
    }

    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": cfg.geminiApiKey!,
      },
      body: JSON.stringify(requestBody),
      timeoutMs: 15000,
    });

    if (!res.ok) {
      // R2-05: Redact upstream response body to prevent leaking provider diagnostics
      throw new Error(`Gemini error: status=${res.status}`);
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
      // R2-05: Redact upstream response body to prevent leaking provider diagnostics
      throw new Error(`Groq error: status=${res.status}`);
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
  // A107-F1: Pin to explicit versioned model ID to prevent silent drift.
  model = "command-r-08-2024";
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
      // R2-05: Redact upstream response body to prevent leaking provider diagnostics
      throw new Error(`Cohere error: status=${res.status}`);
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
/**
 * A114-F1: Global daily AI cost ceiling. When aggregate AI spending across
 * all tenants exceeds this threshold, all AI generation is disabled to
 * protect against quota bypass bugs or misconfigured tenant limits.
 *
 * Configured via AI_GLOBAL_DAILY_CEILING_USD env var (default: 50 USD).
 */
/**
 * S5-A114-03: Apply a 10 % safety margin to the configured ceiling.
 * `recordGlobalCost` uses a KV read-then-write pattern that is subject
 * to a TOCTOU race under concurrent requests (Cloudflare KV does not
 * support atomic CAS). Triggering the limit at 90 % of the nominal
 * value absorbs the maximum plausible overrun from concurrent writes.
 * The per-tenant quota system (`lib/quotas.ts`) remains the primary
 * financial control.
 */
function getGlobalDailyCeilingMicroUsd(): number {
  const raw = process.env.AI_GLOBAL_DAILY_CEILING_USD;
  const usd = raw ? Number(raw) : 50;
  const SAFETY_MARGIN = 0.9;
  if (!Number.isFinite(usd) || usd <= 0) return Math.round(50_000_000 * SAFETY_MARGIN);
  return Math.round(usd * 1_000_000 * SAFETY_MARGIN);
}

/**
 * S5-04: Global daily cost tracker backed by KV for fleet-wide visibility.
 * Falls back to in-memory when KV is unavailable (dev/test), but in
 * production the counter is shared across all isolates via KV.
 */
let globalDailyCostFallback = { date: "", microUsd: 0 };

async function getGlobalDailyCostMicroUsd(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const { getKVNamespace } = await import("@/lib/rate-limit");
    const kv = getKVNamespace();
    if (kv) {
      const key = `global:ai_cost:${today}`;
      const data = (await kv.get(key, "json")) as { count: number } | null;
      return data?.count ?? 0;
    }
  } catch {
    // KV unavailable — fall through to in-memory fallback
  }
  if (globalDailyCostFallback.date !== today) {
    globalDailyCostFallback = { date: today, microUsd: 0 };
  }
  return globalDailyCostFallback.microUsd;
}

/**
 * S5-A114-03: Record global daily AI cost.
 *
 * The KV path uses a read-then-write pattern which has an inherent
 * TOCTOU race under concurrent requests (Cloudflare KV lacks atomic
 * CAS). See `getGlobalDailyCeilingMicroUsd` for the safety-margin
 * mitigation that absorbs the race window.
 */
async function recordGlobalCost(microUsd: number): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const { getKVNamespace } = await import("@/lib/rate-limit");
    const kv = getKVNamespace();
    if (kv) {
      const key = `global:ai_cost:${today}`;
      const data = (await kv.get(key, "json")) as { count: number } | null;
      const current = data?.count ?? 0;
      await kv.put(key, JSON.stringify({ count: current + microUsd }), {
        expirationTtl: 60 * 60 * 36, // 36h
      });
      return;
    }
  } catch {
    // KV unavailable — fall through to in-memory fallback
  }
  if (globalDailyCostFallback.date !== today) {
    globalDailyCostFallback = { date: today, microUsd: 0 };
  }
  globalDailyCostFallback.microUsd += microUsd;
}

class GlobalCostCeilingError extends Error {
  constructor() {
    super("AI generation disabled: global daily cost ceiling reached");
    this.name = "GlobalCostCeilingError";
  }
}

export async function generateWithFallback(
  prompt: string,
  systemPrompt?: string,
  options: GenerateOptions = {},
): Promise<{ text: string; provider: string; model: string }> {
  // A114-F1 / S5-04: Check global daily cost ceiling before any work.
  // Now KV-backed for fleet-wide visibility across all isolates.
  const globalCostSoFar = await getGlobalDailyCostMicroUsd();
  if (globalCostSoFar >= getGlobalDailyCeilingMicroUsd()) {
    throw new GlobalCostCeilingError();
  }

  const safePrompt = sanitizePrompt(prompt);
  const safeSystemPrompt = assembleSystemPrompt(systemPrompt);

  const inputTokenEstimate = estimateTokens(safePrompt) + estimateTokens(safeSystemPrompt ?? "");

  // S5-03: Estimate worst-case cost pre-flight using the most expensive
  // available provider's pricing so the per-tenant cost ceiling is enforced
  // before any generation happens (denial-of-wallet protection).
  const MAX_OUTPUT_TOKENS = 4096;
  const availableProviders = ALL_PROVIDERS.filter(
    (p) => p.isAvailable() && getCircuitBreaker(p.name).getState() !== "OPEN",
  );
  const worstCaseMicroUsd =
    availableProviders.length > 0
      ? Math.max(
          ...availableProviders.map(
            (p) =>
              Math.ceil((inputTokenEstimate * p.pricing.inputMicroUsdPer1k) / 1000) +
              Math.ceil((MAX_OUTPUT_TOKENS * p.pricing.outputMicroUsdPer1k) / 1000),
          ),
        )
      : 0;

  if (options.siteId) {
    // RC-RECHECK-02: Reserve quota atomically before generation so concurrent
    // requests see the reservation. If all providers fail, release the reservation.
    await reserveQuota(options.siteId, "ai_requests", 1);
    if (inputTokenEstimate > 0) {
      await reserveQuota(options.siteId, "ai_tokens", inputTokenEstimate);
    }
    // S5-03: Reserve estimated cost pre-flight against ai_cost_micro_usd ceiling.
    if (worstCaseMicroUsd > 0) {
      await reserveQuota(options.siteId, "ai_cost_micro_usd", worstCaseMicroUsd);
    }
  }

  const errors: string[] = [];

  for (const provider of ALL_PROVIDERS) {
    if (!provider.isAvailable()) {
      errors.push(`${provider.name}: not configured`);
      continue;
    }

    const cb = getCircuitBreaker(provider.name);
    if (cb.getState() === "OPEN") {
      errors.push(`${provider.name}: circuit breaker OPEN`);
      continue;
    }

    try {
      const text = await cb.execute(() => provider.generate(safePrompt, safeSystemPrompt));
      if (options.siteId) {
        // RC-RECHECK-02 / R2-04: Post-flight accounting. ai_requests (1) and
        // ai_tokens (inputTokenEstimate) were already reserved. Record the
        // delta for actual token usage and the cost.
        const outputTokenEstimate = estimateTokens(text);
        const tokenDelta = outputTokenEstimate; // output wasn't reserved
        const microUsd =
          Math.ceil((inputTokenEstimate * provider.pricing.inputMicroUsdPer1k) / 1000) +
          Math.ceil((outputTokenEstimate * provider.pricing.outputMicroUsdPer1k) / 1000);
        const accountingOps: Array<{
          resource: string;
          amount: number;
          fn: () => Promise<void>;
        }> = [];
        // Record output tokens (input was already reserved)
        if (tokenDelta > 0) {
          accountingOps.push({
            resource: "ai_tokens",
            amount: tokenDelta,
            fn: () => recordUsage(options.siteId!, "ai_tokens", tokenDelta),
          });
        }
        // S5-03: Reconcile cost reservation — credit back the difference
        // between worst-case estimate and actual cost, or charge the extra.
        if (worstCaseMicroUsd > 0 || microUsd > 0) {
          const costDelta = microUsd - worstCaseMicroUsd;
          if (costDelta !== 0) {
            accountingOps.push({
              resource: "ai_cost_micro_usd",
              amount: costDelta,
              fn: () => recordUsage(options.siteId!, "ai_cost_micro_usd", costDelta),
            });
          }
        }
        for (const op of accountingOps) {
          try {
            await op.fn();
          } catch (accErr) {
            logger.error("[ai/providers] accounting write failed", {
              siteId: options.siteId,
              resource: op.resource,
              amount: op.amount,
              provider: provider.name,
              error: accErr instanceof Error ? accErr.message : String(accErr),
            });
          }
        }
      }
      // A114-F1 / S5-04: Track global daily cost (KV-backed for fleet-wide protection).
      const globalCostIncrement =
        Math.ceil((inputTokenEstimate * provider.pricing.inputMicroUsdPer1k) / 1000) +
        Math.ceil((estimateTokens(text) * provider.pricing.outputMicroUsdPer1k) / 1000);
      void recordGlobalCost(globalCostIncrement);

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

  // RC-RECHECK-02: All providers failed — release the reserved quota so the
  // tenant isn't charged for a generation that never happened.
  if (options.siteId) {
    try {
      await releaseQuota(options.siteId, "ai_requests", 1);
      if (inputTokenEstimate > 0) {
        await releaseQuota(options.siteId, "ai_tokens", inputTokenEstimate);
      }
      // S5-03: Release the cost reservation on total failure.
      if (worstCaseMicroUsd > 0) {
        await releaseQuota(options.siteId, "ai_cost_micro_usd", worstCaseMicroUsd);
      }
    } catch {
      // fail-open: best-effort [criticality:non-critical]
      // Best-effort release — if KV is down the reservation stays but
      // will be reconciled by the next window rollover.
    }
  }

  // R2-05 / F-26: Normalize provider errors to internal codes. Log diagnostics
  // server-side with only provider name and status code — no raw response bodies.
  const internalError: Error & { providerErrors?: string[] } = new Error(
    "AI generation unavailable: all providers failed",
  );
  internalError.providerErrors = errors.map((e) =>
    e.replace(/: status=\d+.*$/, (m) => m.split("\n")[0]!),
  );
  throw internalError;
}

/** Get list of available (configured) providers */
export function getAvailableProviders(): string[] {
  return ALL_PROVIDERS.filter((p) => p.isAvailable()).map((p) => p.name);
}
