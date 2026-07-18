/**
 * SEO automation helpers for published content.
 *
 * Ensures every AI-generated post has usable meta fields even when the LLM
 * output omits them.
 */

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface DeriveMetaDescriptionInput {
  metaDescription?: string | null;
  excerpt?: string | null;
  body?: string;
}

/**
 * Derive a meta description from the most authoritative source available.
 * Preference order: explicit meta description → excerpt → first 155 chars of body.
 */
export function deriveMetaDescription(input: DeriveMetaDescriptionInput): string | null {
  if (input.metaDescription && input.metaDescription.trim().length > 0) {
    return input.metaDescription.trim().slice(0, 160);
  }
  if (input.excerpt && input.excerpt.trim().length > 0) {
    return input.excerpt.trim().slice(0, 160);
  }
  if (input.body && input.body.trim().length > 0) {
    const text = stripHtml(input.body).slice(0, 157).trim();
    return text.length > 0 ? `${text}...` : null;
  }
  return null;
}

export interface DeriveMetaTitleInput {
  title: string;
  metaTitle?: string | null;
}

/**
 * Derive an SEO meta title from explicit metaTitle or the content title.
 */
export function deriveMetaTitle(input: DeriveMetaTitleInput): string {
  if (input.metaTitle && input.metaTitle.trim().length > 0) {
    return input.metaTitle.trim().slice(0, 60);
  }
  return input.title.trim().slice(0, 60);
}
