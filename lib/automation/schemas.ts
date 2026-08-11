import { validateAdminUrl } from "@/lib/admin-url-guard";

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

export type ProductMetadataUpdate = Partial<{
  name: string;
  description: string;
  image_url: string;
  image_alt: string;
  price: string;
  price_amount: number | null;
  price_currency: string;
  score: number | null;
  featured: boolean;
  category_id: string | null;
  category_ids: string[] | null;
  cta_text: string;
  deal_text: string;
  deal_expires_at: string | null;
  pros: string;
  cons: string;
}>;

const PRODUCT_METADATA_FIELDS = new Set([
  "name",
  "description",
  "image_url",
  "image_alt",
  "price",
  "price_amount",
  "price_currency",
  "score",
  "featured",
  "category_id",
  "category_ids",
  "cta_text",
  "deal_text",
  "deal_expires_at",
  "pros",
  "cons",
]);

export interface ProductUpdateInput {
  product_id: string;
  updates: ProductMetadataUpdate;
}

export interface ProductAffiliateUrlInput {
  product_id: string;
  affiliate_url: string;
}

export interface ProductLifecycleInput {
  product_id: string;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function boundedString(value: unknown, field: string, errors: string[]): string | undefined {
  if (typeof value !== "string") {
    errors.push(`${field} must be a string`);
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length > 2_000) errors.push(`${field} exceeds 2000 chars`);
  return trimmed;
}

export function parseProductUpdateInput(
  body: Record<string, unknown>,
): ValidationResult<ProductUpdateInput> {
  const errors: string[] = [];
  const productId = body.product_id;
  if (!isUuid(productId)) errors.push("product_id must be a uuid");
  let raw: Record<string, unknown>;
  if (body.updates !== undefined) {
    if (!body.updates || typeof body.updates !== "object" || Array.isArray(body.updates)) {
      errors.push("updates must be an object");
      return { ok: false, errors };
    }
    for (const key of Object.keys(body)) {
      if (key !== "product_id" && key !== "updates") errors.push(`${key} is not allowed`);
    }
    raw = body.updates as Record<string, unknown>;
  } else {
    raw = { ...body };
    delete raw.product_id;
  }
  const updates: ProductMetadataUpdate = {};
  for (const key of Object.keys(raw)) {
    if (!PRODUCT_METADATA_FIELDS.has(key)) {
      errors.push(`updates.${key} is not allowed`);
      continue;
    }
    const value = raw[key];
    if (
      [
        "name",
        "description",
        "image_url",
        "image_alt",
        "price",
        "price_currency",
        "cta_text",
        "deal_text",
        "pros",
        "cons",
        "deal_expires_at",
      ].includes(key)
    ) {
      if (key === "deal_expires_at" && value === null) {
        updates.deal_expires_at = null;
        continue;
      }
      const stringValue = boundedString(value, `updates.${key}`, errors);
      if (key === "image_url" && stringValue !== undefined) {
        const imageUrl = validateAdminUrl(stringValue, { allowHttp: true });
        if (!imageUrl.valid) errors.push(`updates.image_url ${imageUrl.error}`);
      }
      if (stringValue !== undefined) (updates as Record<string, unknown>)[key] = stringValue;
    } else if (["price_amount", "score"].includes(key)) {
      if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) {
        errors.push(`updates.${key} must be a finite number or null`);
      } else (updates as Record<string, unknown>)[key] = value;
    } else if (key === "featured") {
      if (typeof value !== "boolean") errors.push("updates.featured must be a boolean");
      else updates.featured = value;
    } else if (key === "category_id") {
      if (value !== null && !isUuid(value))
        errors.push("updates.category_id must be a uuid or null");
      else updates.category_id = value as string | null;
    } else if (key === "category_ids") {
      if (value !== null && (!Array.isArray(value) || value.some((v) => !isUuid(v)))) {
        errors.push("updates.category_ids must be an array of uuids or null");
      } else updates.category_ids = value as string[] | null;
    }
  }
  if (Object.keys(updates).length === 0 && errors.length === 0)
    errors.push("updates cannot be empty");
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { product_id: productId as string, updates } };
}

export function parseProductAffiliateUrlInput(
  body: Record<string, unknown>,
): ValidationResult<ProductAffiliateUrlInput> {
  const errors: string[] = [];
  for (const key of Object.keys(body)) {
    if (key !== "product_id" && key !== "affiliate_url") errors.push(`${key} is not allowed`);
  }
  if (!isUuid(body.product_id)) errors.push("product_id must be a uuid");
  const affiliateUrl = boundedString(body.affiliate_url, "affiliate_url", errors);
  if (!affiliateUrl) errors.push("affiliate_url is required");
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { product_id: body.product_id as string, affiliate_url: affiliateUrl! },
  };
}

export function parseProductLifecycleInput(
  body: Record<string, unknown>,
): ValidationResult<ProductLifecycleInput> {
  const unknown = Object.keys(body).filter((key) => key !== "product_id");
  if (unknown.length > 0)
    return { ok: false, errors: unknown.map((key) => `${key} is not allowed`) };
  if (!isUuid(body.product_id)) return { ok: false, errors: ["product_id must be a uuid"] };
  return { ok: true, value: { product_id: body.product_id as string } };
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

export interface PublishDraftInput {
  title?: string;
  slug?: string;
  excerpt?: string;
  body?: string;
  content_type?: string;
  meta_title?: string | null;
  meta_description?: string | null;
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

/** Validate optional overrides when publishing an AI draft. */
export function parsePublishDraftInput(
  body: Record<string, unknown>,
): ValidationResult<PublishDraftInput> {
  const errors: string[] = [];
  const out: PublishDraftInput = {};

  if (body.title !== undefined) {
    const title = str(body.title);
    if (title.length > MAX.title) errors.push(`title must be at most ${MAX.title} characters`);
    else if (title) out.title = title;
  }

  if (body.slug !== undefined) {
    const slug = str(body.slug);
    if (!slug) {
      out.slug = undefined;
    } else if (!SLUG_RE.test(slug)) {
      errors.push("slug must be lowercase letters/numbers separated by hyphens");
    } else if (slug.length > MAX.slug) {
      errors.push(`slug must be at most ${MAX.slug} characters`);
    } else {
      out.slug = slug;
    }
  }

  if (body.excerpt !== undefined) {
    const excerpt = str(body.excerpt);
    if (excerpt.length > MAX.excerpt)
      errors.push(`excerpt must be at most ${MAX.excerpt} characters`);
    else if (excerpt) out.excerpt = excerpt;
  }

  if (body.body !== undefined) {
    if (typeof body.body !== "string") {
      errors.push("body must be a string");
    } else if (body.body.length > MAX.body) {
      errors.push(`body must be at most ${MAX.body} characters`);
    } else {
      out.body = body.body;
    }
  }

  if (body.content_type !== undefined) {
    const ct = str(body.content_type);
    if (!ct) {
      out.content_type = undefined;
    } else if (!AI_CONTENT_TYPES.includes(ct as (typeof AI_CONTENT_TYPES)[number])) {
      errors.push(`content_type must be one of: ${AI_CONTENT_TYPES.join(", ")}`);
    } else {
      out.content_type = ct;
    }
  }

  if (body.meta_title !== undefined) {
    out.meta_title = body.meta_title === null ? null : str(body.meta_title);
  }

  if (body.meta_description !== undefined) {
    out.meta_description = body.meta_description === null ? null : str(body.meta_description);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: out };
}
