/**
 * AI Content Generator — produces articles, reviews, and comparisons
 * using the provider fallback chain.
 */

import { generateWithFallback } from "./providers";
import {
  moderateInput,
  moderateOutputExtended,
  logModerationRejection,
} from "./content-moderation";
import { sanitizePrompt } from "./prompt-sanitization";
import { sanitizeHtml } from "@/lib/sanitize-html";
import {
  validateOutputFormat,
  validateGeneratedLinks,
  checkContentQuality,
} from "./output-validation";

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
  /** Model identifier used by the provider (e.g. "gemini-1.5-flash-002") */
  model: string;
  /** A115-F1: Regulatory terms found that require manual verification before publishing. */
  regulatoryWarnings?: string[];
  /** S5-A105-02: Content quality warnings (word count, missing keywords). Non-blocking. */
  qualityWarnings?: string[];
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
  // A101-F5: Sanitize each productName individually before joining to prevent
  // delimiter-breaking characters or role-impersonation in individual items.
  const sanitizedProducts = input.productNames?.map((name) =>
    sanitizePrompt(name, { maxChars: 200, label: "productName" }),
  );
  const productsStr = sanitizedProducts?.length
    ? `\nProducts to cover: ${sanitizedProducts.join(", ")}`
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
    const line = lines[i]!.trim();
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
 * A109 / S5-05: AI-generated content watermark.
 *
 * The previous in-body approach (HTML comment + <meta> tag prepended to
 * body HTML) was stripped by `sanitizeHtml` on every render and publish
 * path because `<meta>` is not in the sanitizer allowlist and HTML
 * comments have no handler. The watermark was therefore dead.
 *
 * Fix: the `ai_generated` boolean DB column (set via `createContent`
 * in the publish path) is the authoritative provenance signal. The
 * public-facing `<meta name="ai-generated">` tag is now emitted from
 * the page-level template/layout where it is outside the sanitized
 * body and cannot be stripped. See `app/[site]/[slug]/page.tsx`.
 *
 * The in-body constant is retained only as a `data-` attribute on an
 * allowed wrapper tag so it survives sanitization as a secondary
 * in-content signal for downstream syndication scrapers.
 */
const AI_GENERATED_WATERMARK = '<div data-ai-generated="true"></div>\n';

/**
 * Error thrown when content moderation rejects input or output.
 * Callers can check `instanceof ContentModerationError` to distinguish
 * moderation rejections from provider / quota errors.
 */
class ContentModerationError extends Error {
  constructor(
    message: string,
    public readonly phase: "input" | "output",
  ) {
    super(message);
    this.name = "ContentModerationError";
  }
}

/**
 * Generate a single piece of content using the AI fallback chain.
 *
 * Per-tenant quota gating (G-42): the call is charged against
 * `input.siteId` so AI tokens / requests / cost are attributed to the
 * correct tenant. See `lib/quotas.ts` for the resource taxonomy and
 * `docs/per-tenant-quotas.md` for the operator-facing contract.
 *
 * A107 audit fix: input moderation screens `topic` and `keywords`
 * before the LLM call; output moderation screens the generated text
 * for prohibited content and leaked secrets/preamble.
 *
 * A109 audit fix: an AI-generated watermark (`<meta name="ai-generated">`)
 * is prepended to every generated body for EU AI Act Art. 50 compliance.
 */
export async function generateContent(input: GenerateContentInput): Promise<GeneratedContent> {
  // A107: Screen user-supplied input before calling the LLM.
  const inputCheck = moderateInput(input.topic, input.keywords);
  if (!inputCheck.passed) {
    // A108-F3: Log moderation rejection to audit trail.
    logModerationRejection("input", inputCheck.reason!, {
      siteId: input.siteId,
      topic: input.topic,
    });
    throw new ContentModerationError(`[ai] Input moderation failed: ${inputCheck.reason}`, "input");
  }

  const systemPrompt = SYSTEM_PROMPTS[input.contentType];
  const prompt = buildPrompt(input);

  const { text, provider, model } = await generateWithFallback(prompt, systemPrompt, {
    siteId: input.siteId,
  });

  // A115-F3 / A106-F1: Output format validation — reject responses that don't
  // conform to the expected TITLE:/EXCERPT:/META_ prefix structure. This catches
  // jailbreak attempts that produce non-article output.
  const formatCheck = validateOutputFormat(text);
  if (!formatCheck.valid) {
    logModerationRejection("output", `Format validation failed: ${formatCheck.reason}`, {
      siteId: input.siteId,
      topic: input.topic,
    });
    throw new ContentModerationError(
      `[ai] Output format validation failed: ${formatCheck.reason}`,
      "output",
    );
  }

  const parsed = parseResponse(text, input.contentType);

  // A108: Screen model output for prohibited content, leaked secrets, and
  // regulatory claims (A115-F1).
  // S5-02: Include metaTitle and metaDescription in the scanned text so
  // secrets or prohibited content in <meta> fields cannot bypass the scanner.
  const combinedOutput = `${parsed.title} ${parsed.excerpt} ${parsed.metaTitle} ${parsed.metaDescription} ${parsed.body}`;
  const outputCheck = moderateOutputExtended(combinedOutput);
  if (!outputCheck.passed) {
    // A108-F3: Log moderation rejection to audit trail.
    logModerationRejection("output", outputCheck.reason!, {
      siteId: input.siteId,
      topic: input.topic,
    });
    throw new ContentModerationError(
      `[ai] Output moderation failed: ${outputCheck.reason}`,
      "output",
    );
  }

  // I-02: Sanitize AI-generated HTML before storage (defense-in-depth).
  // This prevents stored XSS if any render path skips render-time sanitization.
  const sanitizedBody = sanitizeHtml(parsed.body);

  // A115-F2: Post-generation link validator — check all href domains in
  // generated content against allowed domains. Flags phishing links.
  const linkCheck = validateGeneratedLinks(sanitizedBody);
  if (!linkCheck.valid) {
    logModerationRejection(
      "output",
      `Suspicious links detected: ${linkCheck.flaggedDomains.join(", ")}`,
      {
        siteId: input.siteId,
        topic: input.topic,
      },
    );
    throw new ContentModerationError(
      `[ai] Generated content contains unrecognized link domains: ${linkCheck.flaggedDomains.join(", ")}`,
      "output",
    );
  }

  // A109 / S5-05: Prepend AI-generated watermark using a data-attribute on
  // an allowed tag so it survives sanitization (unlike the old <meta>/comment).
  const watermarkedBody = `${AI_GENERATED_WATERMARK}${sanitizedBody}`;

  // S5-A105-02: Run content quality gates (word count, keyword presence).
  // Non-blocking — warnings are surfaced to the admin review queue, not a hard rejection.
  const qualityCheck = checkContentQuality(sanitizedBody, input.keywords);

  return {
    ...parsed,
    body: watermarkedBody,
    provider,
    model,
    // A115-F1: Include regulatory warnings so admin UI can surface them.
    ...(outputCheck.regulatoryWarnings && { regulatoryWarnings: outputCheck.regulatoryWarnings }),
    // S5-A105-02: Include quality warnings so admin UI can surface them.
    ...(qualityCheck.warnings.length > 0 && { qualityWarnings: qualityCheck.warnings }),
  };
}
