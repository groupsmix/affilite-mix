/**
 * A115-F3 / A106-F1 / A105-F4: Output format and content validation.
 *
 * Validates that AI-generated responses conform to the expected format
 * (TITLE:/EXCERPT:/META_ prefix structure) and meet minimum quality
 * thresholds. Also validates links in generated content against allowed
 * domains to prevent phishing (A115-F2).
 */
import "server-only";

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
/*  A115-F2: Post-Generation Link Validation                           */
/* ------------------------------------------------------------------ */

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
      href.startsWith("/") ||
      href.startsWith("#") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:")
    ) {
      continue;
    }

    // Extract domain from absolute URL
    let domain: string;
    try {
      const url = new URL(href);
      domain = url.hostname.toLowerCase();
    } catch {
      // fail-open: best-effort [criticality:non-critical]
      // Malformed URL — flag it
      flaggedDomains.push(href.slice(0, 50));
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
