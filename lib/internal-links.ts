import type { ProductRow } from "@/types/database";

/**
 * Auto-link product name mentions in HTML content body.
 * Only links the first occurrence of each product name to avoid cluttering.
 * Skips text already inside <a> tags or HTML attributes.
 */
export function injectProductLinks(
  html: string,
  products: ProductRow[],
): string {
  if (!products.length || !html) return html;

  let result = html;

  for (const product of products) {
    const name = product.name;
    if (!name || name.length < 3) continue;

    // Skip products without an affiliate URL — no tracking link to generate
    if (!product.affiliate_url) continue;

    // Escape special regex characters in product name
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Match the product name as a whole word, but NOT inside an existing <a> tag
    // Strategy: split on <a...>...</a> segments, only replace in non-anchor parts
    const anchorPattern = /<a\b[^>]*>[\s\S]*?<\/a>/gi;
    const parts: string[] = [];
    let lastIndex = 0;
    let matched = false;

    let anchorMatch: RegExpExecArray | null;
    while ((anchorMatch = anchorPattern.exec(result)) !== null) {
      // Process text before anchor
      const textBefore = result.slice(lastIndex, anchorMatch.index);
      if (!matched) {
        const { text, didReplace } = replaceFirst(textBefore, escaped, product);
        parts.push(text);
        if (didReplace) matched = true;
      } else {
        parts.push(textBefore);
      }
      // Keep anchor as-is
      parts.push(anchorMatch[0]);
      lastIndex = anchorMatch.index + anchorMatch[0].length;
    }

    // Process remaining text after last anchor
    const remaining = result.slice(lastIndex);
    if (!matched) {
      const { text } = replaceFirst(remaining, escaped, product);
      parts.push(text);
    } else {
      parts.push(remaining);
    }

    result = parts.join("");
  }

  return result;
}

function replaceFirst(
  text: string,
  escapedName: string,
  product: ProductRow,
): { text: string; didReplace: boolean } {
  // Only match in text content, not inside HTML tags
  // Use a pattern that ensures we're not inside a tag attribute
  const pattern = new RegExp(
    `(?<=>|^)([^<]*?)\\b(${escapedName})\\b`,
    "i",
  );

  const match = pattern.exec(text);
  if (!match) return { text, didReplace: false };

  const trackUrl = `/api/track/click?p=${encodeURIComponent(product.slug)}&t=inline`;
  const link = `<a href="${trackUrl}" target="_blank" rel="noopener noreferrer nofollow" class="text-emerald-600 font-medium hover:underline">${match[2]}</a>`;

  const replaced =
    text.slice(0, match.index) +
    match[1] +
    link +
    text.slice(match.index + match[0].length);

  return { text: replaced, didReplace: true };
}
