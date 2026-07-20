/**
 * A115-F3 / A106-F1 / A105-F4: Output format and content validation.
 *
 * Validates that AI-generated responses conform to the expected format
 * (TITLE:/EXCERPT:/META_ prefix structure) and meet minimum quality
 * thresholds. Also validates links in generated content against allowed
 * domains to prevent phishing (A115-F2).
 */
import "server-only";
import { autoSlug } from "@/lib/auto-slug";

/* ------------------------------------------------------------------ */
/*  Output Format Validation (A115-F3)                                 */
/* ------------------------------------------------------------------ */

export interface FormatValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validate that the AI response conforms to the expected output structure.
 * Rejects responses that don't start with TITLE: prefix (likely jailbreak
 * output) or that are too short to be a real article.
 */
export function validateOutputFormat(rawResponse: string): FormatValidationResult {
  if (!rawResponse || rawResponse.trim().length === 0) {
    return { valid: false, reason: "Empty response" };
  }

  // A115-F3: Reject responses under 500 chars — likely not a real article.
  if (rawResponse.trim().length < 500) {
    return {
      valid: false,
      reason: "Response too short (< 500 chars) — likely not a valid article",
    };
  }

  // Check for expected prefix structure in first 10 lines.
  const lines = rawResponse.split("\n").slice(0, 15);
  const hasTitle = lines.some((l) => l.trim().startsWith("TITLE:"));
  const hasExcerpt = lines.some((l) => l.trim().startsWith("EXCERPT:"));

  if (!hasTitle) {
    return { valid: false, reason: "Response missing TITLE: prefix — format not conforming" };
  }
  if (!hasExcerpt) {
    return { valid: false, reason: "Response missing EXCERPT: prefix — format not conforming" };
  }

  return { valid: true };
}

/* ------------------------------------------------------------------ */
/*  A105-F4: Content Quality Gates                                     */
/* ------------------------------------------------------------------ */

export interface QualityCheckResult {
  passed: boolean;
  wordCount: number;
  warnings: string[];
}

/**
 * Basic quality gates for generated content. Checks minimum word count
 * and keyword presence.
 */
export function checkContentQuality(body: string, expectedKeywords?: string[]): QualityCheckResult {
  const warnings: string[] = [];

  // Word count check (A105-F4: >= 800 words)
  const wordCount = body.split(/\s+/).filter((w) => w.length > 0).length;
  if (wordCount < 800) {
    warnings.push(`Word count ${wordCount} is below minimum 800`);
  }

  // Keyword presence check
  if (expectedKeywords && expectedKeywords.length > 0) {
    const lowerBody = body.toLowerCase();
    const missing = expectedKeywords.filter((kw) => !lowerBody.includes(kw.toLowerCase()));
    if (missing.length > 0) {
      warnings.push(`Missing keywords: ${missing.join(", ")}`);
    }
  }

  return {
    passed: warnings.length === 0,
    wordCount,
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/*  On-page SEO validation for AI-generated content                    */
/* ------------------------------------------------------------------ */

export interface OnPageSeoInput {
  title: string;
  metaTitle: string;
  metaDescription: string;
  body: string;
  slug: string;
  contentType: string;
  primaryKeyword?: string;
}

export interface OnPageSeoResult {
  passed: boolean;
  warnings: string[];
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getHeadingText(body: string, tag: string): string[] {
  const texts: string[] = [];
  const regex = new RegExp(`<${tag}\\b[^>]*>([^]*?)</${tag}>`, "gi");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(body)) !== null) {
    texts.push(stripHtmlTags(match[1]!));
  }
  return texts;
}

export function checkOnPageSeo(input: OnPageSeoInput): OnPageSeoResult {
  const warnings: string[] = [];
  const currentYear = new Date().getFullYear().toString();
  const rawKeyword = (input.primaryKeyword || "").trim();
  const lowerKeyword = rawKeyword.toLowerCase();
  const keywordSlugFragment = rawKeyword ? autoSlug(rawKeyword).toLowerCase() : "";

  // Title / meta title length
  if (input.metaTitle.length > 60) {
    warnings.push(`Meta title length ${input.metaTitle.length} exceeds 60 chars`);
  }
  if (input.title.length > 100) {
    warnings.push(`Title/H1 length ${input.title.length} exceeds 100 chars`);
  }

  // Meta description length
  if (input.metaDescription.length > 155) {
    warnings.push(`Meta description length ${input.metaDescription.length} exceeds 155 chars`);
  }

  // Primary keyword placement
  if (lowerKeyword) {
    if (!input.metaTitle.toLowerCase().includes(lowerKeyword)) {
      warnings.push("Primary keyword missing from meta title");
    }
    if (!input.title.toLowerCase().includes(lowerKeyword)) {
      warnings.push("Primary keyword missing from title/H1");
    }
    if (keywordSlugFragment && !input.slug.toLowerCase().includes(keywordSlugFragment)) {
      warnings.push("Primary keyword missing from URL slug");
    }

    const plainBody = stripHtmlTags(input.body);
    const first100Words = plainBody.split(/\s+/).slice(0, 100).join(" ").toLowerCase();
    if (!first100Words.includes(lowerKeyword)) {
      warnings.push("Primary keyword missing in first 100 words");
    }

    const h2Texts = getHeadingText(input.body, "h2");
    const h2Joined = h2Texts.join(" ").toLowerCase();
    if (!h2Joined.includes(lowerKeyword)) {
      warnings.push("Primary keyword missing from H2 headings");
    }

    // Click reason signal in meta description: look for digits or reason phrases
    const hasClickReason =
      /\d/.test(input.metaDescription) ||
      /tested|reviewed|compared|checked|updated|guide/i.test(input.metaDescription);
    if (!hasClickReason) {
      warnings.push("Meta description should include a click reason (e.g. 'tested 14 exchanges')");
    }
  }

  // Body should not contain h1 (page template already provides h1)
  const h1Count = (input.body.match(/<h1\b/gi) || []).length;
  if (h1Count > 0) {
    warnings.push(`Body contains ${h1Count} <h1> tag(s); use <h2> instead`);
  }

  // FAQ section for review/comparison content
  if (input.contentType === "review" || input.contentType === "comparison") {
    const questionHeadings = (input.body.match(/<h[2-6]\b[^>]*>[^]*?\?[^]*?<\/h[2-6]>/gi) || [])
      .length;
    if (questionHeadings < 3) {
      warnings.push(`FAQ section has fewer than 3 question headings (${questionHeadings})`);
    }
  }

  // Best-X pages should include the current year
  const lowerTitle = input.title.toLowerCase();
  if (
    /\bbest\b/.test(lowerTitle) &&
    !input.title.includes(currentYear) &&
    !input.metaTitle.includes(currentYear)
  ) {
    warnings.push(`Best-X title/meta title may be missing the current year (${currentYear})`);
  }

  return { passed: warnings.length === 0, warnings };
}

/* ------------------------------------------------------------------ */
/*  E-E-A-T / trust + content-strategy validation                       */
/* ------------------------------------------------------------------ */

export interface EeatCheckResult {
  passed: boolean;
  warnings: string[];
}

export function checkEeatAndContentStrategy(
  body: string,
  contentType: string,
  siteNiche?: string,
): EeatCheckResult {
  const warnings: string[] = [];
  const lowerBody = body.toLowerCase();

  // Content strategy: internal links (relative hrefs) for topical clusters
  const internalLinks = (body.match(/href=["']\//gi) || []).length;
  if (internalLinks < 3) {
    warnings.push(`Only ${internalLinks} internal link(s); aim for 3-5 related page links`);
  }

  // Content strategy: X-vs-Y / comparison tables for comparison content
  if (contentType === "comparison" && !body.includes("<table")) {
    warnings.push("Comparison content is missing a side-by-side <table>");
  }

  // E-E-A-T: primary-source outbound citations (at least one https:// link)
  const externalHttps = (body.match(/href=["']https:\/\//gi) || []).length;
  if (externalHttps < 1) {
    warnings.push(
      "No outbound HTTPS citations; add primary-source links (fee schedules, official docs)",
    );
  }

  // E-E-A-T: testing evidence / first-hand language
  const testingPhrases =
    /tested|hands[- ]on|we signed up|we used|we compared|live account|verified|screenshots|original photos/i;
  if (!testingPhrases.test(body)) {
    warnings.push("Missing testing-evidence language (e.g. 'tested', 'hands-on', 'live account')");
  }

  // YMYL-specific: crypto/finance should back claims with sources and avoid unqualified claims
  const isYmyl = /crypto|bitcoin|exchange|trading|wallet|finance|tax/i.test(
    `${siteNiche ?? ""} ${lowerBody}`.toLowerCase(),
  );
  if (isYmyl && externalHttps < 2) {
    warnings.push("YMYL topic should cite at least 2 primary-source outbound links");
  }

  return { passed: warnings.length === 0, warnings };
}

/**
 * Known-good domain patterns for affiliate content links.
 * In production, this should be loaded from config/sites or a DB table.
 * Links to domains NOT in this list are flagged for admin review.
 */
const ALLOWED_LINK_DOMAIN_PATTERNS: ReadonlyArray<RegExp> = [
  // Common affiliate networks
  /^(www\.)?amazon\.(com|co\.uk|de|fr|es|it|ca|com\.au|co\.jp)(\/|$)/,
  /^(www\.)?amzn\.(to|com)(\/|$)/,
  /^(www\.)?ebay\.(com|co\.uk|de|fr)(\/|$)/,
  /^(www\.)?aliexpress\.com(\/|$)/,
  // Common generic domains (Wikipedia, YouTube, etc.)
  /^(www\.|en\.)?wikipedia\.org(\/|$)/,
  /^(www\.)?youtube\.com(\/|$)/,
  /^(www\.)?youtu\.be(\/|$)/,
  // Relative or same-site links (no domain)
  /^$/,
];

/**
 * Environment variable to extend allowed domains at runtime.
 * Format: comma-separated domain list.
 * e.g. AI_ALLOWED_LINK_DOMAINS="mysite.com,partner.example.com"
 */
function getExtraAllowedDomains(): string[] {
  const raw = process.env.AI_ALLOWED_LINK_DOMAINS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

export interface LinkValidationResult {
  valid: boolean;
  flaggedDomains: string[];
  totalLinks: number;
}

/**
 * Extract all href domains from HTML content and validate against
 * the allowed domain list. Flags unknown domains that could be phishing.
 */
export function validateGeneratedLinks(html: string): LinkValidationResult {
  // Extract all href values from anchor tags
  const hrefPattern = /href=["']([^"']+)["']/gi;
  const flaggedDomains: string[] = [];
  let totalLinks = 0;
  let match: RegExpExecArray | null;

  const extraDomains = getExtraAllowedDomains();

  while ((match = hrefPattern.exec(html)) !== null) {
    const href = match[1];
    totalLinks++;

    // Skip relative links, anchors, mailto, tel
    if (
      href!.startsWith("/") ||
      href!.startsWith("#") ||
      href!.startsWith("mailto:") ||
      href!.startsWith("tel:")
    ) {
      continue;
    }

    // Extract domain from absolute URL
    let domain: string;
    try {
      const url = new URL(href!);
      domain = url.hostname.toLowerCase();
    } catch {
      // fail-open: best-effort [criticality:non-critical]
      // Malformed URL — flag it
      flaggedDomains.push(href!.slice(0, 50));
      continue;
    }

    // Check against allowed patterns
    const isAllowed =
      ALLOWED_LINK_DOMAIN_PATTERNS.some((p) => p.test(domain)) ||
      extraDomains.some((d) => domain === d || domain.endsWith(`.${d}`));

    if (!isAllowed) {
      flaggedDomains.push(domain);
    }
  }

  return {
    valid: flaggedDomains.length === 0,
    flaggedDomains: [...new Set(flaggedDomains)], // deduplicate
    totalLinks,
  };
}
