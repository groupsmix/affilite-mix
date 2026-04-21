/**
 * AI Content Generator — produces articles, reviews, and comparisons
 * using the provider fallback chain.
 */

import { generateWithFallback } from "./providers";

export type AIContentType = "article" | "review" | "comparison" | "guide";

export interface GenerateContentInput {
  siteId: string;
  siteName: string;
  niche: string;
  contentType: AIContentType;
  topic: string;
  keywords?: string[];
  language?: string;
  productNames?: string[];
}

export interface GeneratedContent {
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  metaTitle: string;
  metaDescription: string;
  contentType: AIContentType;
  provider: string;
  /** Model identifier used by the provider (e.g. "gemini-1.5-flash") */
  model: string;
}

const SYSTEM_PROMPTS: Record<AIContentType, string> = {
  article: `You are an expert content writer for affiliate marketing websites.
Write engaging, SEO-optimized articles that provide genuine value to readers.
Always include practical insights and actionable advice.
Format the output as HTML with proper headings (h2, h3), paragraphs, and lists.
Do NOT include the title as an h1 — it will be added separately.`,

  review: `You are an expert product reviewer for affiliate marketing websites.
Write honest, detailed reviews that help readers make informed purchase decisions.
Include pros and cons, key features, pricing information, and a verdict.
Format the output as HTML with proper headings (h2, h3), paragraphs, and lists.
Do NOT include the title as an h1 — it will be added separately.`,

  comparison: `You are an expert product comparison writer for affiliate marketing websites.
Write detailed side-by-side comparisons that help readers choose between products.
Include feature comparisons, pricing, pros/cons for each, and a clear recommendation.
Format the output as HTML with proper headings (h2, h3), paragraphs, comparison tables, and lists.
Do NOT include the title as an h1 — it will be added separately.`,

  guide: `You are an expert guide writer for affiliate marketing websites.
Write comprehensive, step-by-step guides that provide genuine value.
Include practical tips, common mistakes to avoid, and recommendations.
Format the output as HTML with proper headings (h2, h3), paragraphs, numbered steps, and lists.
Do NOT include the title as an h1 — it will be added separately.`,
};

function buildPrompt(input: GenerateContentInput): string {
  const lang = input.language === "ar" ? "Arabic" : "English";
  const keywordStr = input.keywords?.length
    ? `\nTarget keywords: ${input.keywords.join(", ")}`
    : "";
  const productsStr = input.productNames?.length
    ? `\nProducts to cover: ${input.productNames.join(", ")}`
    : "";

  return `Write a ${input.contentType} about "${input.topic}" for ${input.siteName} (${input.niche}).
Language: ${lang}${keywordStr}${productsStr}

Requirements:
1. Write a compelling title (output it on the FIRST line, prefixed with "TITLE: ")
2. Write a 1-2 sentence excerpt (output it on the SECOND line, prefixed with "EXCERPT: ")
3. Write an SEO meta title under 60 chars (output it on the THIRD line, prefixed with "META_TITLE: ")
4. Write an SEO meta description under 155 chars (output it on the FOURTH line, prefixed with "META_DESC: ")
5. Then output the full article body as HTML (starting from the FIFTH line)

Make the content at least 1000 words, well-structured, and genuinely useful.`;
}

function parseResponse(
  raw: string,
  contentType: AIContentType,
): Omit<GeneratedContent, "provider" | "model"> {
  const lines = raw.split("\n");
  let title = "";
  let excerpt = "";
  let metaTitle = "";
  let metaDescription = "";
  let bodyStartIndex = 0;

  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i].trim();
    if (line.startsWith("TITLE:")) {
      title = line.replace("TITLE:", "").trim();
      bodyStartIndex = i + 1;
    } else if (line.startsWith("EXCERPT:")) {
      excerpt = line.replace("EXCERPT:", "").trim();
      bodyStartIndex = i + 1;
    } else if (line.startsWith("META_TITLE:")) {
      metaTitle = line.replace("META_TITLE:", "").trim();
      bodyStartIndex = i + 1;
    } else if (line.startsWith("META_DESC:")) {
      metaDescription = line.replace("META_DESC:", "").trim();
      bodyStartIndex = i + 1;
    } else if (title && excerpt) {
      break;
    }
  }

  const body = lines.slice(bodyStartIndex).join("\n").trim();

  if (!title) {
    title = `${contentType.charAt(0).toUpperCase() + contentType.slice(1)}: Generated Content`;
  }

  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);

  return {
    title,
    slug,
    excerpt: excerpt || title,
    body: body || raw,
    metaTitle: metaTitle || title.slice(0, 60),
    metaDescription: metaDescription || excerpt.slice(0, 155),
    contentType,
  };
}

/**
 * Generate a single piece of content using the AI fallback chain.
 */
export async function generateContent(input: GenerateContentInput): Promise<GeneratedContent> {
  const systemPrompt = SYSTEM_PROMPTS[input.contentType];
  const prompt = buildPrompt(input);

  const { text, provider, model } = await generateWithFallback(prompt, systemPrompt);
  const parsed = parseResponse(text, input.contentType);

  return { ...parsed, provider, model };
}

/**
 * Generate multiple topic suggestions for a given niche.
 */
export async function generateTopicSuggestions(
  niche: string,
  contentType: AIContentType,
  count: number = 5,
): Promise<{ topics: string[]; provider: string }> {
  const prompt = `Suggest ${count} compelling ${contentType} topics for a website about "${niche}".
Each topic should be:
- SEO-friendly and searchable
- Genuinely useful for readers
- Suitable for affiliate marketing content

Output each topic on its own line, numbered 1-${count}. No other text.`;

  const { text, provider } = await generateWithFallback(prompt);

  const topics = text
    .split("\n")
    .map((line) => line.replace(/^\d+[\.\)]\s*/, "").trim())
    .filter((line) => line.length > 5);

  return { topics: topics.slice(0, count), provider };
}
