"use client";

import { useEffect } from "react";

const AI_REFERRER_PATTERNS = [
  { host: "chatgpt.com", source: "chatgpt" },
  { host: "chat.openai.com", source: "chatgpt" },
  { host: "perplexity.ai", source: "perplexity" },
  { host: "www.perplexity.ai", source: "perplexity" },
  { host: "gemini.google.com", source: "gemini" },
  { host: "bard.google.com", source: "gemini" },
  { host: "copilot.microsoft.com", source: "copilot" },
  { host: "search.brave.com", source: "brave" },
  { host: "you.com", source: "you" },
];

function classifyReferrer(referrer: string): string | null {
  try {
    const url = new URL(referrer);
    const host = url.hostname.toLowerCase();
    const match = AI_REFERRER_PATTERNS.find((p) => host === p.host || host.endsWith(`.${p.host}`));
    return match?.source ?? null;
  } catch {
    return null;
  }
}

/**
 * Track visitors arriving from AI / answer engines.
 *
 * Sends a GA4 custom event `ai_referral` when `document.referrer` matches a
 * known AI engine host (ChatGPT, Perplexity, Gemini, Copilot, Brave, You.com).
 * This makes it possible to measure GEO traffic in the GA4 dashboard.
 */
export function AIReferrerTracker() {
  useEffect(() => {
    if (typeof window === "undefined" || !document.referrer) return;

    const source = classifyReferrer(document.referrer);
    if (!source) return;

    const gtag = (window as unknown as Record<string, unknown>).gtag as
      | ((...args: unknown[]) => void)
      | undefined;

    if (typeof gtag !== "function") {
      // GA4 may still be loading; skip rather than crash.
      return;
    }

    gtag("event", "ai_referral", {
      source,
      referrer: document.referrer,
    });
  }, []);

  return null;
}
