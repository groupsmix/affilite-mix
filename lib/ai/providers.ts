/**
 * AI Provider abstraction with fallback chain.
 *
 * Order: Cloudflare AI → Google Gemini → Groq → Cohere
 * Each provider is tried in sequence; if one fails or hits rate limits,
 * the next one is used automatically.
 */

export interface AIProvider {
  name: string;
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

/* ------------------------------------------------------------------ */
/*  Cloudflare AI Provider                                             */
/* ------------------------------------------------------------------ */

class CloudflareAIProvider implements AIProvider {
  name = "Cloudflare AI";

  isAvailable(): boolean {
    const cfg = getProviderConfig();
    return Boolean(cfg.cloudflareAccountId && cfg.cloudflareApiToken);
  }

  async generate(prompt: string, systemPrompt?: string): Promise<string> {
    const cfg = getProviderConfig();
    const url = `https://api.cloudflare.com/client/v4/accounts/${cfg.cloudflareAccountId}/ai/run/@cf/meta/llama-3.1-8b-instruct`;

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

  isAvailable(): boolean {
    return Boolean(getProviderConfig().geminiApiKey);
  }

  async generate(prompt: string, systemPrompt?: string): Promise<string> {
    const cfg = getProviderConfig();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${cfg.geminiApiKey}`;

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

  isAvailable(): boolean {
    return Boolean(getProviderConfig().groqApiKey);
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
        model: "llama-3.1-8b-instant",
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

  isAvailable(): boolean {
    return Boolean(getProviderConfig().cohereApiKey);
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
        model: "command-r",
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
): Promise<{ text: string; provider: string }> {
  const errors: string[] = [];

  for (const provider of ALL_PROVIDERS) {
    if (!provider.isAvailable()) {
      errors.push(`${provider.name}: not configured`);
      continue;
    }

    try {
      const text = await provider.generate(prompt, systemPrompt);
      return { text, provider: provider.name };
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
