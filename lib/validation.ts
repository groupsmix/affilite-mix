/**
 * Plain TypeScript input validation helpers (zero dependencies).
 * Each validate* function returns { data, errors } — if errors is non-null
 * the request should be rejected with 400.
 */

// Re-export shared email validation from the canonical utility module (task 18.6)
export { isValidEmail } from "./validate-email";

type ValidationResult<T> =
  | { data: T; errors: null }
  | { data: null; errors: Record<string, string> };

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isNumber(v: unknown): v is number {
  return typeof v === "number" && !Number.isNaN(v);
}

function isBoolean(v: unknown): v is boolean {
  return typeof v === "boolean";
}

/** Safely coerce an already-validated value to string (avoids `as string`). */
function toString(v: unknown): string {
  return isString(v) ? v : "";
}

/** Safely coerce an already-validated value to number | null. */
function toNumberOrNull(v: unknown): number | null {
  return isNumber(v) ? v : null;
}

/** Safely coerce an already-validated value to string | null. */
function toStringOrNull(v: unknown): string | null {
  return isString(v) && v !== "" ? v : null;
}

const SLUG_RE = /^[a-z0-9-]+$/;

function isSlug(v: unknown): v is string {
  return isString(v) && SLUG_RE.test(v);
}

function isUuid(v: unknown): v is string {
  return isString(v) && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function isUrl(v: unknown): v is string {
  if (!isString(v)) return false;
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
}

/** Validate that a URL uses the https:// scheme (prevents javascript:, data:, etc.) */
function isHttpsUrl(v: unknown): v is string {
  if (!isString(v)) return false;
  try {
    const url = new URL(v);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Type guard: checks whether a value belongs to a known Set of literal values. */
function isMemberOf<T extends string>(v: unknown, set: Set<string>): v is T {
  return isString(v) && set.has(v);
}

/** Type guard: checks whether a value is a plain object (not null, not array). */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ── Categories ────────────────────────────────────────────

const TAXONOMY_TYPES = new Set(["general", "budget", "occasion", "recipient", "brand"]);
type TaxonomyType = "general" | "budget" | "occasion" | "recipient" | "brand";

export interface CreateCategoryInput {
  name: string;
  slug: string;
  description: string;
  taxonomy_type: TaxonomyType;
}

export function validateCreateCategory(
  body: Record<string, unknown>,
): ValidationResult<CreateCategoryInput> {
  const errors: Record<string, string> = {};

  if (!isString(body.name) || body.name.length < 1 || body.name.length > 200) {
    errors.name = "name must be a string between 1 and 200 characters";
  }
  if (!isSlug(body.slug) || body.slug.length > 200) {
    errors.slug = "slug must be a lowercase alphanumeric string with hyphens, max 200 chars";
  }

  if (
    body.taxonomy_type !== undefined &&
    !isMemberOf<TaxonomyType>(body.taxonomy_type, TAXONOMY_TYPES)
  ) {
    errors.taxonomy_type =
      "taxonomy_type must be one of: general, budget, occasion, recipient, brand";
  }

  if (Object.keys(errors).length > 0) return { data: null, errors };
  return {
    data: {
      name: toString(body.name),
      slug: toString(body.slug),
      description: toString(body.description),
      taxonomy_type: isMemberOf<TaxonomyType>(body.taxonomy_type, TAXONOMY_TYPES)
        ? body.taxonomy_type
        : "general",
    },
    errors: null,
  };
}

export interface UpdateCategoryInput {
  id: string;
  name?: string;
  slug?: string;
  description?: string;
  taxonomy_type?: TaxonomyType;
}

export function validateUpdateCategory(
  body: Record<string, unknown>,
): ValidationResult<UpdateCategoryInput> {
  const errors: Record<string, string> = {};

  if (!isUuid(body.id)) {
    errors.id = "id must be a valid UUID";
  }
  if (
    body.name !== undefined &&
    (!isString(body.name) || body.name.length < 1 || body.name.length > 200)
  ) {
    errors.name = "name must be a string between 1 and 200 characters";
  }
  if (body.slug !== undefined && (!isSlug(body.slug) || body.slug.length > 200)) {
    errors.slug = "slug must be a lowercase alphanumeric string with hyphens, max 200 chars";
  }

  if (
    body.taxonomy_type !== undefined &&
    !isMemberOf<TaxonomyType>(body.taxonomy_type, TAXONOMY_TYPES)
  ) {
    errors.taxonomy_type =
      "taxonomy_type must be one of: general, budget, occasion, recipient, brand";
  }

  if (Object.keys(errors).length > 0) return { data: null, errors };

  const data: UpdateCategoryInput = { id: toString(body.id) };
  if (isString(body.name)) data.name = body.name;
  if (isString(body.slug)) data.slug = body.slug;
  if (isString(body.description)) data.description = body.description;
  if (isMemberOf<TaxonomyType>(body.taxonomy_type, TAXONOMY_TYPES))
    data.taxonomy_type = body.taxonomy_type;
  return { data, errors: null };
}

// ── Products ──────────────────────────────────────────────

export interface CreateProductInput {
  name: string;
  slug: string;
  description: string;
  affiliate_url: string;
  image_url: string;
  image_alt: string;
  price: string;
  price_amount: number | null;
  price_currency: string;
  merchant: string;
  score: number | null;
  featured: boolean;
  status: "draft" | "active" | "archived";
  category_id: string | null;
  cta_text: string;
  deal_text: string;
  deal_expires_at: string | null;
  pros: string;
  cons: string;
}

const PRODUCT_STATUSES = new Set(["draft", "active", "archived"]);
type ProductStatus = "draft" | "active" | "archived";

export function validateCreateProduct(
  body: Record<string, unknown>,
): ValidationResult<CreateProductInput> {
  const errors: Record<string, string> = {};

  if (!isString(body.name) || body.name.length < 1 || body.name.length > 200) {
    errors.name = "name must be a string between 1 and 200 characters";
  }
  if (!isSlug(body.slug) || body.slug.length > 200) {
    errors.slug = "slug must be a lowercase alphanumeric string with hyphens, max 200 chars";
  }
  if (body.description !== undefined && body.description !== "" && !isString(body.description)) {
    errors.description = "description must be a string";
  }
  if (
    body.affiliate_url !== undefined &&
    body.affiliate_url !== "" &&
    !isHttpsUrl(body.affiliate_url)
  ) {
    errors.affiliate_url = "affiliate_url must be a valid HTTPS URL or empty string";
  }
  if (body.image_url !== undefined && body.image_url !== "" && !isUrl(body.image_url)) {
    errors.image_url = "image_url must be a valid URL or empty string";
  }
  if (
    isString(body.image_url) &&
    body.image_url !== "" &&
    (!isString(body.image_alt) || body.image_alt.trim() === "")
  ) {
    errors.image_alt =
      "image_alt is required when image_url is provided — describe what is shown in the image, not just the product name";
  }
  if (body.price !== undefined && !isString(body.price)) {
    errors.price = "price must be a string";
  }
  if (body.merchant !== undefined && !isString(body.merchant)) {
    errors.merchant = "merchant must be a string";
  }
  if (
    body.score !== undefined &&
    body.score !== null &&
    (!isNumber(body.score) || body.score < 0 || body.score > 10)
  ) {
    errors.score = "score must be a number between 0 and 10, or null";
  }
  if (body.status !== undefined && !isMemberOf<ProductStatus>(body.status, PRODUCT_STATUSES)) {
    errors.status = "status must be one of: draft, active, archived";
  }
  if (body.category_id !== undefined && body.category_id !== null && !isUuid(body.category_id)) {
    errors.category_id = "category_id must be a valid UUID or null";
  }

  if (Object.keys(errors).length > 0) return { data: null, errors };
  return {
    data: {
      name: toString(body.name),
      slug: toString(body.slug),
      description: toString(body.description),
      affiliate_url: toString(body.affiliate_url),
      image_url: toString(body.image_url),
      image_alt: toString(body.image_alt),
      price: toString(body.price),
      price_amount: toNumberOrNull(body.price_amount),
      price_currency: isString(body.price_currency) ? body.price_currency : "USD",
      merchant: toString(body.merchant),
      score: toNumberOrNull(body.score),
      featured: isBoolean(body.featured) ? body.featured : false,
      status: isMemberOf<ProductStatus>(body.status, PRODUCT_STATUSES) ? body.status : "active",
      category_id: isUuid(body.category_id) ? body.category_id : null,
      cta_text: toString(body.cta_text),
      deal_text: toString(body.deal_text),
      deal_expires_at: toStringOrNull(body.deal_expires_at),
      pros: toString(body.pros),
      cons: toString(body.cons),
    },
    errors: null,
  };
}

export interface UpdateProductInput {
  id: string;
  name?: string;
  slug?: string;
  description?: string;
  affiliate_url?: string;
  image_url?: string;
  image_alt?: string;
  price?: string;
  price_amount?: number | null;
  price_currency?: string;
  merchant?: string;
  score?: number | null;
  featured?: boolean;
  status?: ProductStatus;
  category_id?: string | null;
  cta_text?: string;
  deal_text?: string;
  deal_expires_at?: string | null;
  pros?: string;
  cons?: string;
}

export function validateUpdateProduct(
  body: Record<string, unknown>,
): ValidationResult<UpdateProductInput> {
  const errors: Record<string, string> = {};

  if (!isUuid(body.id)) {
    errors.id = "id must be a valid UUID";
  }
  if (
    body.name !== undefined &&
    (!isString(body.name) || body.name.length < 1 || body.name.length > 200)
  ) {
    errors.name = "name must be a string between 1 and 200 characters";
  }
  if (body.slug !== undefined && (!isSlug(body.slug) || body.slug.length > 200)) {
    errors.slug = "slug must be a lowercase alphanumeric string with hyphens, max 200 chars";
  }
  if (
    body.affiliate_url !== undefined &&
    body.affiliate_url !== "" &&
    !isHttpsUrl(body.affiliate_url)
  ) {
    errors.affiliate_url = "affiliate_url must be a valid HTTPS URL or empty string";
  }
  if (
    body.score !== undefined &&
    body.score !== null &&
    (!isNumber(body.score) || body.score < 0 || body.score > 10)
  ) {
    errors.score = "score must be a number between 0 and 10, or null";
  }
  if (body.status !== undefined && !isMemberOf<ProductStatus>(body.status, PRODUCT_STATUSES)) {
    errors.status = "status must be one of: draft, active, archived";
  }
  if (body.category_id !== undefined && body.category_id !== null && !isUuid(body.category_id)) {
    errors.category_id = "category_id must be a valid UUID or null";
  }

  if (Object.keys(errors).length > 0) return { data: null, errors };

  const data: UpdateProductInput = { id: toString(body.id) };
  if (isString(body.name)) data.name = body.name;
  if (isString(body.slug)) data.slug = body.slug;
  if (isString(body.description)) data.description = body.description;
  if (isString(body.affiliate_url)) data.affiliate_url = body.affiliate_url;
  if (isString(body.image_url)) data.image_url = body.image_url;
  if (isString(body.image_alt)) data.image_alt = body.image_alt;
  if (isString(body.price)) data.price = body.price;
  if (body.price_amount !== undefined)
    data.price_amount = isNumber(body.price_amount) ? body.price_amount : null;
  if (isString(body.price_currency)) data.price_currency = body.price_currency;
  if (isString(body.merchant)) data.merchant = body.merchant;
  if (body.score !== undefined) data.score = isNumber(body.score) ? body.score : null;
  if (isBoolean(body.featured)) data.featured = body.featured;
  if (isMemberOf<ProductStatus>(body.status, PRODUCT_STATUSES)) data.status = body.status;
  if (body.category_id !== undefined)
    data.category_id = isUuid(body.category_id) ? body.category_id : null;
  if (isString(body.cta_text)) data.cta_text = body.cta_text;
  if (isString(body.deal_text)) data.deal_text = body.deal_text;
  if (body.deal_expires_at !== undefined)
    data.deal_expires_at = toStringOrNull(body.deal_expires_at);
  if (isString(body.pros)) data.pros = body.pros;
  if (isString(body.cons)) data.cons = body.cons;
  return { data, errors: null };
}

// ── Content ───────────────────────────────────────────────

export const CONTENT_TYPES = new Set(["article", "review", "comparison", "guide", "blog"]);
type ContentType = "article" | "review" | "comparison" | "guide" | "blog";
type ContentStatus = "draft" | "review" | "scheduled" | "published" | "archived";

export interface CreateContentInput {
  title: string;
  slug: string;
  body: string;
  excerpt: string;
  featured_image: string;
  type: ContentType;
  status: ContentStatus;
  category_id: string | null;
  tags: string[];
  author: string | null;
  publish_at: string | null;
  meta_title: string | null;
  meta_description: string | null;
  og_image: string | null;
}

const CONTENT_STATUSES = new Set(["draft", "review", "scheduled", "published", "archived"]);

export function validateCreateContent(
  body: Record<string, unknown>,
): ValidationResult<CreateContentInput> {
  const errors: Record<string, string> = {};

  if (!isString(body.title) || body.title.length < 1 || body.title.length > 500) {
    errors.title = "title must be a string between 1 and 500 characters";
  }
  if (!isSlug(body.slug) || body.slug.length > 500) {
    errors.slug = "slug must be a lowercase alphanumeric string with hyphens, max 500 chars";
  }
  if (body.body !== undefined && !isString(body.body)) {
    errors.body = "body must be a string";
  }
  if (isString(body.body) && body.body.length > 500_000) {
    errors.body = "body must be less than 500,000 characters";
  }
  if (body.excerpt !== undefined && !isString(body.excerpt)) {
    errors.excerpt = "excerpt must be a string";
  }
  if (body.status !== undefined && !isMemberOf<ContentStatus>(body.status, CONTENT_STATUSES)) {
    errors.status = "status must be one of: draft, review, scheduled, published, archived";
  }
  if (body.category_id !== undefined && body.category_id !== null && !isUuid(body.category_id)) {
    errors.category_id = "category_id must be a valid UUID or null";
  }
  if (body.tags !== undefined && !Array.isArray(body.tags)) {
    errors.tags = "tags must be an array of strings";
  }

  if (Object.keys(errors).length > 0) return { data: null, errors };
  return {
    data: {
      title: toString(body.title),
      slug: toString(body.slug),
      body: toString(body.body),
      excerpt: toString(body.excerpt),
      featured_image: toString(body.featured_image),
      type: isMemberOf<ContentType>(body.type, CONTENT_TYPES) ? body.type : "article",
      status: isMemberOf<ContentStatus>(body.status, CONTENT_STATUSES) ? body.status : "draft",
      category_id: isUuid(body.category_id) ? body.category_id : null,
      tags: Array.isArray(body.tags) ? body.tags.filter(isString) : [],
      author: toStringOrNull(body.author),
      publish_at: toStringOrNull(body.publish_at),
      meta_title: toStringOrNull(body.meta_title),
      meta_description: toStringOrNull(body.meta_description),
      og_image: toStringOrNull(body.og_image),
    },
    errors: null,
  };
}

export interface UpdateContentInput {
  id: string;
  title?: string;
  slug?: string;
  body?: string;
  excerpt?: string;
  featured_image?: string;
  type?: ContentType;
  status?: ContentStatus;
  category_id?: string | null;
  tags?: string[];
  author?: string | null;
  publish_at?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  og_image?: string | null;
}

export function validateUpdateContent(
  body: Record<string, unknown>,
): ValidationResult<UpdateContentInput> {
  const errors: Record<string, string> = {};

  if (!isUuid(body.id)) {
    errors.id = "id must be a valid UUID";
  }
  if (
    body.title !== undefined &&
    (!isString(body.title) || body.title.length < 1 || body.title.length > 500)
  ) {
    errors.title = "title must be a string between 1 and 500 characters";
  }
  if (body.slug !== undefined && (!isSlug(body.slug) || body.slug.length > 500)) {
    errors.slug = "slug must be a lowercase alphanumeric string with hyphens, max 500 chars";
  }
  if (body.body !== undefined && !isString(body.body)) {
    errors.body = "body must be a string";
  }
  if (body.body !== undefined && isString(body.body) && body.body.length > 500_000) {
    errors.body = "body must be less than 500,000 characters";
  }
  if (body.type !== undefined && !isMemberOf<ContentType>(body.type, CONTENT_TYPES)) {
    errors.type = "type must be one of: article, review, comparison, guide, blog";
  }
  if (body.status !== undefined && !isMemberOf<ContentStatus>(body.status, CONTENT_STATUSES)) {
    errors.status = "status must be one of: draft, review, scheduled, published, archived";
  }
  if (body.category_id !== undefined && body.category_id !== null && !isUuid(body.category_id)) {
    errors.category_id = "category_id must be a valid UUID or null";
  }

  if (Object.keys(errors).length > 0) return { data: null, errors };

  const data: UpdateContentInput = { id: toString(body.id) };
  if (isString(body.title)) data.title = body.title;
  if (isString(body.slug)) data.slug = body.slug;
  if (isString(body.body)) data.body = body.body;
  if (isString(body.excerpt)) data.excerpt = body.excerpt;
  if (isString(body.featured_image)) data.featured_image = body.featured_image;
  if (isMemberOf<ContentType>(body.type, CONTENT_TYPES)) data.type = body.type;
  if (isMemberOf<ContentStatus>(body.status, CONTENT_STATUSES)) data.status = body.status;
  if (body.category_id !== undefined)
    data.category_id = isUuid(body.category_id) ? body.category_id : null;
  if (Array.isArray(body.tags)) data.tags = body.tags.filter(isString);
  if (body.author !== undefined) data.author = toStringOrNull(body.author);
  if (body.publish_at !== undefined) data.publish_at = toStringOrNull(body.publish_at);
  if (body.meta_title !== undefined) data.meta_title = toStringOrNull(body.meta_title);
  if (body.meta_description !== undefined)
    data.meta_description = toStringOrNull(body.meta_description);
  if (body.og_image !== undefined) data.og_image = toStringOrNull(body.og_image);
  return { data, errors: null };
}

// ── Content-Products ──────────────────────────────────────

const LINK_ROLES = new Set(["hero", "featured", "related", "vs-left", "vs-right"]);
type LinkRole = "hero" | "featured" | "related" | "vs-left" | "vs-right";

export interface ContentProductLink {
  product_id: string;
  role: LinkRole;
}

export interface SetLinkedProductsInput {
  content_id: string;
  links: ContentProductLink[];
}

export function validateSetLinkedProducts(
  body: Record<string, unknown>,
): ValidationResult<SetLinkedProductsInput> {
  const errors: Record<string, string> = {};

  if (!isUuid(body.content_id)) {
    errors.content_id = "content_id must be a valid UUID";
  }

  if (body.links !== undefined && !Array.isArray(body.links)) {
    errors.links = "links must be an array";
  } else if (Array.isArray(body.links)) {
    for (let i = 0; i < body.links.length; i++) {
      const link: unknown = body.links[i];
      if (!isRecord(link)) {
        errors[`links[${i}]`] = "each link must be an object";
        continue;
      }
      if (!isUuid(link.product_id)) {
        errors[`links[${i}].product_id`] = "product_id must be a valid UUID";
      }
      if (!isString(link.role) || !LINK_ROLES.has(link.role)) {
        errors[`links[${i}].role`] =
          "role must be one of: hero, featured, related, vs-left, vs-right";
      }
    }
  }

  if (Object.keys(errors).length > 0) return { data: null, errors };

  const validatedLinks: ContentProductLink[] = Array.isArray(body.links)
    ? body.links
        .filter(isRecord)
        .filter(
          (link): link is Record<string, unknown> & { product_id: string; role: LinkRole } =>
            isUuid(link.product_id) && isMemberOf<LinkRole>(link.role, LINK_ROLES),
        )
        .map((link) => ({ product_id: link.product_id, role: link.role }))
    : [];

  return {
    data: {
      content_id: toString(body.content_id),
      links: validatedLinks,
    },
    errors: null,
  };
}
