/**
 * In-editor AI rewrite / expand / summarize helpers.
 * Used by the TipTap AI assistant button in content-form.
 */

import { generateWithFallback } from "./providers";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { sanitizePrompt } from "./prompt-sanitization";

export type RewriteAction = "expand" | "rewrite" | "rephrase" | "summarize";

const ACTION_DESCRIPTIONS: Record<RewriteAction, string> = {
  expand: "expand the text while keeping the same meaning and adding useful detail",
  rewrite: "rewrite the text to be clearer and more engaging while keeping the same meaning",
  rephrase: "rephrase the text in a different way, simpler and more direct",
  summarize: "shorten the text to a concise summary that keeps the key points",
};

function buildPrompt(text: string, action: RewriteAction): string {
  const safeText = sanitizePrompt(text, { maxChars: 4000, label: "text" });
  const actionText = ACTION_DESCRIPTIONS[action];
  return `Please ${actionText}.

Return ONLY the rewritten text, no explanatory notes, no markdown code fences.
The text should be returned as clean HTML with simple paragraphs, headings, lists, and emphasis where appropriate.

Original text:
${safeText}`;
}

export interface RewriteResult {
  text: string;
  provider: string;
  model: string;
}

export async function rewriteText(text: string, action: RewriteAction): Promise<RewriteResult> {
  if (!text.trim()) {
    throw new Error("No text provided for rewrite");
  }

  const systemPrompt =
    "You are an assistant that helps edit content. You respond with clean, safe HTML. Do not include the original text or any commentary.";

  const {
    text: raw,
    provider,
    model,
  } = await generateWithFallback(buildPrompt(text, action), systemPrompt);
  const sanitized = sanitizeHtml(raw);
  return { text: sanitized, provider, model };
}
