/**
 * Request validation for automation mutations. Deliberately hand-rolled
 * (no runtime schema dependency) and defensive: unknown fields are ignored,
 * strings are length-capped, and everything is bounded so untrusted model
 * output cannot smuggle oversized or malformed payloads (plan §9.3, §12).
 */

export interface DraftInput {
  title: string;
  slug: string;
  body: string;
  excerpt: string;
  content_type: string;
  topic: string;
  keywords: string[];
  meta_title: string | null;
  meta_description: string | null;
  ai_provider: string;
  ai_model: string;
  run_id: string | null;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const MAX = {
  title: 300,
  slug: 300,
  body: 200_000,
  excerpt: 1_000,
  short: 200,
  keywords: 25,
} as const;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DRAFT_STATUSES = ["pending", "approved", "rejected", "published"] as const;
const AI_CONTENT_TYPES = ["article", "review", "comparison", "guide"] as const;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function parseDraftInput(body: Record<string, unknown>): ValidationResult<DraftInput> {
  const errors: string[] = [];

  const title = str(body.title);
  if (!title) errors.push("title is required");
  else if (title.length > MAX.title) errors.push(`title exceeds ${MAX.title} chars`);

  const slug = str(body.slug);
  if (!slug) errors.push("slug is required");
  else if (slug.length > MAX.slug) errors.push(`slug exceeds ${MAX.slug} chars`);
  else if (!SLUG_RE.test(slug)) errors.push("slug must be lowercase alphanumeric with hyphens");

  const content = str(body.body);
  if (!content) errors.push("body is required");
  else if (content.length > MAX.body) errors.push(`body exceeds ${MAX.body} chars`);

  const excerpt = str(body.excerpt);
  if (excerpt.length > MAX.excerpt) errors.push(`excerpt exceeds ${MAX.excerpt} chars`);

  const contentType = str(body.content_type) || "article";
  const topic = str(body.topic);

  let keywords: string[] = [];
  if (Array.isArray(body.keywords)) {
    keywords = body.keywords
      .filter((k): k is string => typeof k === "string")
      .map((k) => k.trim())
      .filter((k) => k.length > 0)
      .slice(0, MAX.keywords);
  }

  const metaTitle = str(body.meta_title);
  const metaDescription = str(body.meta_description);
  if (metaTitle.length > MAX.short) errors.push(`meta_title exceeds ${MAX.short} chars`);
  if (metaDescription.length > MAX.excerpt)
    errors.push(`meta_description exceeds ${MAX.excerpt} chars`);

  let runId: string | null = null;
  if (body.run_id != null) {
    const candidate = str(body.run_id);
    if (!UUID_RE.test(candidate)) errors.push("run_id must be a uuid");
    else runId = candidate;
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      title,
      slug,
      body: content,
      excerpt,
      content_type: contentType,
      topic,
      keywords,
      meta_title: metaTitle || null,
      meta_description: metaDescription || null,
      ai_provider: str(body.ai_provider) || "external",
      ai_model: str(body.ai_model) || "unknown",
      run_id: runId,
    },
  };
}

export interface DraftUpdateInput {
  title?: string;
  slug?: string;
  body?: string;
  excerpt?: string;
  content_type?: string;
  topic?: string;
  keywords?: string[];
  meta_title?: string | null;
  meta_description?: string | null;
  ai_provider?: string;
  ai_model?: string;
  status?: (typeof DRAFT_STATUSES)[number];
  run_id?: string | null;
}

/** Validate a partial update for an AI draft. All fields are optional. */
export function parseDraftUpdateInput(
  body: Record<string, unknown>,
): ValidationResult<DraftUpdateInput> {
  const errors: string[] = [];
  const out: DraftUpdateInput = {};

  if (body.title !== undefined) {
    const title = str(body.title);
    if (!title) errors.push("title cannot be empty");
    else if (title.length > MAX.title) errors.push(`title exceeds ${MAX.title} chars`);
    else out.title = title;
  }

  if (body.slug !== undefined) {
    const slug = str(body.slug);
    if (!slug) errors.push("slug cannot be empty");
    else if (slug.length > MAX.slug) errors.push(`slug exceeds ${MAX.slug} chars`);
    else if (!SLUG_RE.test(slug)) errors.push("slug must be lowercase alphanumeric with hyphens");
    else out.slug = slug;
  }

  if (body.body !== undefined) {
    const content = str(body.body);
    if (!content) errors.push("body cannot be empty");
    else if (content.length > MAX.body) errors.push(`body exceeds ${MAX.body} chars`);
    else out.body = content;
  }

  if (body.excerpt !== undefined) {
    const excerpt = str(body.excerpt);
    if (excerpt.length > MAX.excerpt) errors.push(`excerpt exceeds ${MAX.excerpt} chars`);
    else out.excerpt = excerpt;
  }

  if (body.content_type !== undefined) {
    out.content_type = str(body.content_type) || "article";
  }

  if (body.topic !== undefined) {
    out.topic = str(body.topic);
  }

  if (body.keywords !== undefined) {
    if (Array.isArray(body.keywords)) {
      out.keywords = body.keywords
        .filter((k): k is string => typeof k === "string")
        .map((k) => k.trim())
        .filter((k) => k.length > 0)
        .slice(0, MAX.keywords);
    } else {
      errors.push("keywords must be an array");
    }
  }

  if (body.meta_title !== undefined) {
    const metaTitle = str(body.meta_title);
    if (metaTitle.length > MAX.short) errors.push(`meta_title exceeds ${MAX.short} chars`);
    else out.meta_title = metaTitle || null;
  }

  if (body.meta_description !== undefined) {
    const metaDescription = str(body.meta_description);
    if (metaDescription.length > MAX.excerpt)
      errors.push(`meta_description exceeds ${MAX.excerpt} chars`);
    else out.meta_description = metaDescription || null;
  }

  if (body.ai_provider !== undefined) {
    out.ai_provider = str(body.ai_provider) || "external";
  }

  if (body.ai_model !== undefined) {
    out.ai_model = str(body.ai_model) || "unknown";
  }

  if (body.status !== undefined) {
    const status = str(body.status);
    if (!DRAFT_STATUSES.includes(status as (typeof DRAFT_STATUSES)[number])) {
      errors.push(`status must be one of: ${DRAFT_STATUSES.join(", ")}`);
    } else {
      out.status = status as (typeof DRAFT_STATUSES)[number];
    }
  }

  if (body.run_id !== undefined) {
    if (body.run_id === null) {
      out.run_id = null;
    } else {
      const candidate = str(body.run_id);
      if (!UUID_RE.test(candidate)) errors.push("run_id must be a uuid");
      else out.run_id = candidate;
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: out };
}

export interface GenerateContentInput {
  topic: string;
  content_type: (typeof AI_CONTENT_TYPES)[number];
  keywords: string[];
}

/** Validate a request to generate AI content from a topic. */
export function parseGenerateContentInput(
  body: Record<string, unknown>,
): ValidationResult<GenerateContentInput> {
  const errors: string[] = [];

  const topic = str(body.topic);
  if (!topic) errors.push("topic is required");
  else if (topic.length > 300) errors.push("topic exceeds 300 chars");

  const contentType = str(body.content_type) || "article";
  if (!AI_CONTENT_TYPES.includes(contentType as (typeof AI_CONTENT_TYPES)[number])) {
    errors.push(`content_type must be one of: ${AI_CONTENT_TYPES.join(", ")}`);
  }

  const keywords: string[] = [];
  if (body.keywords !== undefined) {
    if (!Array.isArray(body.keywords)) {
      errors.push("keywords must be an array");
    } else {
      keywords.push(
        ...body.keywords
          .filter((k): k is string => typeof k === "string")
          .map((k) => k.trim())
          .filter((k) => k.length > 0)
          .slice(0, MAX.keywords),
      );
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { topic, content_type: contentType as (typeof AI_CONTENT_TYPES)[number], keywords },
  };
}
