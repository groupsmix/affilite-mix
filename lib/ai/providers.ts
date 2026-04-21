/**
 * AI Provider abstraction with fallback chain.
 *
 * Order: Cloudflare AI → Google Gemini → Groq → Cohere
 * Each provider is tried in sequence; if one fails or hits rate limits,
 * the next one is used automatically.
 */

export interface AIProvider {
  name: string;
  /** Model identifier used by this provider (recorded alongside generations) */
  model: string;
  generate(prompt: string, systemPrompt?: string): Promise<string>;
  isAvailable(): boolean;
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

    const res = await fetch(url, {
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

  isAvailable(): boolean {
    return Boolean(getProviderConfig().geminiApiKey) && isProviderFlagEnabled("AI_ENABLE_GEMINI");
  }

  async generate(prompt: string, systemPrompt?: string): Promise<string> {
    const cfg = getProviderConfig();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${cfg.geminiApiKey}`;

    const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: { maxOutputTokens: 4096 },
      }),
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

    const res = await fetch(url, {
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

    const res = await fetch(url, {
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
 * Try each provider in order until one succeeds.
 * Throws if all providers fail.
 */
export async function generateWithFallback(
  prompt: string,
  systemPrompt?: string,
): Promise<{ text: string; provider: string; model: string }> {
  const errors: string[] = [];

  for (const provider of ALL_PROVIDERS) {
    if (!provider.isAvailable()) {
      errors.push(`${provider.name}: not configured`);
      continue;
    }

    try {
      const text = await provider.generate(prompt, systemPrompt);
      return { text, provider: provider.name, model: provider.model };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${provider.name}: ${msg}`);
    }
  }

  throw new Error(`All AI providers failed:\n${errors.join("\n")}`);
}

/** Get list of available (configured) providers */
export function getAvailableProviders(): string[] {
  return ALL_PROVIDERS.filter((p) => p.isAvailable()).map((p) => p.name);
}
