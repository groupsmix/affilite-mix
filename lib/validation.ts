/**
 * Plain TypeScript input validation helpers (zero dependencies).
 * Each validate* function returns { data, errors } — if errors is non-null
 * the request should be rejected with 400.
 */

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validate an email address format. */
export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
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

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((item) => typeof item === "string");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ── Enum type guards ─────────────────────────────────────

type TaxonomyType = "general" | "budget" | "occasion" | "recipient" | "brand";
const TAXONOMY_TYPES: ReadonlySet<string> = new Set([
  "general",
  "budget",
  "occasion",
  "recipient",
  "brand",
]);

function isTaxonomyType(v: unknown): v is TaxonomyType {
  return isString(v) && TAXONOMY_TYPES.has(v);
}

type ProductStatus = "draft" | "active" | "archived";
const PRODUCT_STATUSES: ReadonlySet<string> = new Set(["draft", "active", "archived"]);

function isProductStatus(v: unknown): v is ProductStatus {
  return isString(v) && PRODUCT_STATUSES.has(v);
}

export type ContentType = "article" | "review" | "comparison" | "guide" | "blog";
export const CONTENT_TYPES: ReadonlySet<string> = new Set([
  "article",
  "review",
  "comparison",
  "guide",
  "blog",
]);

function isContentType(v: unknown): v is ContentType {
  return isString(v) && CONTENT_TYPES.has(v);
}

type ContentStatus = "draft" | "review" | "scheduled" | "published" | "archived";
const CONTENT_STATUSES: ReadonlySet<string> = new Set([
  "draft",
  "review",
  "scheduled",
  "published",
  "archived",
]);

function isContentStatus(v: unknown): v is ContentStatus {
  return isString(v) && CONTENT_STATUSES.has(v);
}

type LinkRole = "hero" | "featured" | "related" | "vs-left" | "vs-right";
const LINK_ROLES: ReadonlySet<string> = new Set([
  "hero",
  "featured",
  "related",
  "vs-left",
  "vs-right",
]);

function isLinkRole(v: unknown): v is LinkRole {
  return isString(v) && LINK_ROLES.has(v);
}

// ── Categories ────────────────────────────────────────────

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

  if (body.taxonomy_type !== undefined && !isTaxonomyType(body.taxonomy_type)) {
    errors.taxonomy_type =
      "taxonomy_type must be one of: general, budget, occasion, recipient, brand";
  }

  if (Object.keys(errors).length > 0) return { data: null, errors };

  if (!isString(body.name) || !isString(body.slug)) {
    return { data: null, errors: { _: "unexpected validation state" } };
  }

  return {
    data: {
      name: body.name,
      slug: body.slug,
      description: isString(body.description) ? body.description : "",
      taxonomy_type: isTaxonomyType(body.taxonomy_type) ? body.taxonomy_type : "general",
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

  if (body.taxonomy_type !== undefined && !isTaxonomyType(body.taxonomy_type)) {
    errors.taxonomy_type =
      "taxonomy_type must be one of: general, budget, occasion, recipient, brand";
  }

  if (Object.keys(errors).length > 0) return { data: null, errors };
  if (!isUuid(body.id)) return { data: null, errors: { id: "id must be a valid UUID" } };

  const data: UpdateCategoryInput = { id: body.id };
  if (isString(body.name)) data.name = body.name;
  if (isString(body.slug)) data.slug = body.slug;
  if (isString(body.description)) data.description = body.description;
  if (isTaxonomyType(body.taxonomy_type)) data.taxonomy_type = body.taxonomy_type;
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
  status: ProductStatus;
  category_id: string | null;
  cta_text: string;
  deal_text: string;
  deal_expires_at: string | null;
  pros: string;
  cons: string;
}

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
  if (body.status !== undefined && !isProductStatus(body.status)) {
    errors.status = "status must be one of: draft, active, archived";
  }
  if (body.category_id !== undefined && body.category_id !== null && !isUuid(body.category_id)) {
    errors.category_id = "category_id must be a valid UUID or null";
  }

  if (Object.keys(errors).length > 0) return { data: null, errors };

  if (!isString(body.name) || !isString(body.slug)) {
    return { data: null, errors: { _: "unexpected validation state" } };
  }

  return {
    data: {
      name: body.name,
      slug: body.slug,
      description: isString(body.description) ? body.description : "",
      affiliate_url: isString(body.affiliate_url) ? body.affiliate_url : "",
      image_url: isString(body.image_url) ? body.image_url : "",
      image_alt: isString(body.image_alt) ? body.image_alt : "",
      price: isString(body.price) ? body.price : "",
      price_amount: isNumber(body.price_amount) ? body.price_amount : null,
      price_currency: isString(body.price_currency) ? body.price_currency : "USD",
      merchant: isString(body.merchant) ? body.merchant : "",
      score: isNumber(body.score) ? body.score : null,
      featured: isBoolean(body.featured) ? body.featured : false,
      status: isProductStatus(body.status) ? body.status : "active",
      category_id: isUuid(body.category_id) ? body.category_id : null,
      cta_text: isString(body.cta_text) ? body.cta_text : "",
      deal_text: isString(body.deal_text) ? body.deal_text : "",
      deal_expires_at: isString(body.deal_expires_at) ? body.deal_expires_at : null,
      pros: isString(body.pros) ? body.pros : "",
      cons: isString(body.cons) ? body.cons : "",
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
  if (body.status !== undefined && !isProductStatus(body.status)) {
    errors.status = "status must be one of: draft, active, archived";
  }
  if (body.category_id !== undefined && body.category_id !== null && !isUuid(body.category_id)) {
    errors.category_id = "category_id must be a valid UUID or null";
  }

  if (Object.keys(errors).length > 0) return { data: null, errors };
  if (!isUuid(body.id)) return { data: null, errors: { id: "id must be a valid UUID" } };

  const data: UpdateProductInput = { id: body.id };
  if (isString(body.name)) data.name = body.name;
  if (isString(body.slug)) data.slug = body.slug;
  if (isString(body.description)) data.description = body.description;
  if (isString(body.affiliate_url)) data.affiliate_url = body.affiliate_url;
  if (isString(body.image_url)) data.image_url = body.image_url;
  if (isString(body.image_alt)) data.image_alt = body.image_alt;
  if (isString(body.price)) data.price = body.price;
  if (body.price_amount !== undefined) {
    data.price_amount = isNumber(body.price_amount) ? body.price_amount : null;
  }
  if (isString(body.price_currency)) data.price_currency = body.price_currency;
  if (isString(body.merchant)) data.merchant = body.merchant;
  if (body.score !== undefined) {
    data.score = isNumber(body.score) ? body.score : null;
  }
  if (isBoolean(body.featured)) data.featured = body.featured;
  if (isProductStatus(body.status)) data.status = body.status;
  if (body.category_id !== undefined) {
    data.category_id = isUuid(body.category_id) ? body.category_id : null;
  }
  if (isString(body.cta_text)) data.cta_text = body.cta_text;
  if (isString(body.deal_text)) data.deal_text = body.deal_text;
  if (body.deal_expires_at !== undefined) {
    data.deal_expires_at = isString(body.deal_expires_at) ? body.deal_expires_at : null;
  }
  if (isString(body.pros)) data.pros = body.pros;
  if (isString(body.cons)) data.cons = body.cons;
  return { data, errors: null };
}

// ── Content ───────────────────────────────────────────────

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
  if (body.status !== undefined && !isContentStatus(body.status)) {
    errors.status = "status must be one of: draft, review, scheduled, published, archived";
  }
  if (body.category_id !== undefined && body.category_id !== null && !isUuid(body.category_id)) {
    errors.category_id = "category_id must be a valid UUID or null";
  }
  if (body.tags !== undefined && !Array.isArray(body.tags)) {
    errors.tags = "tags must be an array of strings";
  }

  if (Object.keys(errors).length > 0) return { data: null, errors };

  if (!isString(body.title) || !isString(body.slug)) {
    return { data: null, errors: { _: "unexpected validation state" } };
  }

  return {
    data: {
      title: body.title,
      slug: body.slug,
      body: isString(body.body) ? body.body : "",
      excerpt: isString(body.excerpt) ? body.excerpt : "",
      featured_image: isString(body.featured_image) ? body.featured_image : "",
      type: isContentType(body.type) ? body.type : "article",
      status: isContentStatus(body.status) ? body.status : "draft",
      category_id: isUuid(body.category_id) ? body.category_id : null,
      tags: isStringArray(body.tags) ? body.tags : [],
      author: isString(body.author) ? body.author : null,
      publish_at: isString(body.publish_at) && body.publish_at !== "" ? body.publish_at : null,
      meta_title: isString(body.meta_title) && body.meta_title !== "" ? body.meta_title : null,
      meta_description:
        isString(body.meta_description) && body.meta_description !== ""
          ? body.meta_description
          : null,
      og_image: isString(body.og_image) && body.og_image !== "" ? body.og_image : null,
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
  if (body.type !== undefined && !isContentType(body.type)) {
    errors.type = "type must be one of: article, review, comparison, guide, blog";
  }
  if (body.status !== undefined && !isContentStatus(body.status)) {
    errors.status = "status must be one of: draft, review, scheduled, published, archived";
  }
  if (body.category_id !== undefined && body.category_id !== null && !isUuid(body.category_id)) {
    errors.category_id = "category_id must be a valid UUID or null";
  }

  if (Object.keys(errors).length > 0) return { data: null, errors };
  if (!isUuid(body.id)) return { data: null, errors: { id: "id must be a valid UUID" } };

  const data: UpdateContentInput = { id: body.id };
  if (isString(body.title)) data.title = body.title;
  if (isString(body.slug)) data.slug = body.slug;
  if (isString(body.body)) data.body = body.body;
  if (isString(body.excerpt)) data.excerpt = body.excerpt;
  if (isString(body.featured_image)) data.featured_image = body.featured_image;
  if (isContentType(body.type)) data.type = body.type;
  if (isContentStatus(body.status)) data.status = body.status;
  if (body.category_id !== undefined) {
    data.category_id = isUuid(body.category_id) ? body.category_id : null;
  }
  if (isStringArray(body.tags)) data.tags = body.tags;
  if (body.author !== undefined) {
    data.author = isString(body.author) ? body.author : null;
  }
  if (body.publish_at !== undefined) {
    data.publish_at = isString(body.publish_at) && body.publish_at !== "" ? body.publish_at : null;
  }
  if (body.meta_title !== undefined)
    data.meta_title = isString(body.meta_title) && body.meta_title !== "" ? body.meta_title : null;
  if (body.meta_description !== undefined)
    data.meta_description =
      isString(body.meta_description) && body.meta_description !== ""
        ? body.meta_description
        : null;
  if (body.og_image !== undefined)
    data.og_image = isString(body.og_image) && body.og_image !== "" ? body.og_image : null;
  return { data, errors: null };
}

// ── Content-Products ──────────────────────────────────────

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
      const raw = body.links[i];
      if (!isRecord(raw)) {
        errors[`links[${i}]`] = "each link must be an object";
        continue;
      }
      if (!isUuid(raw.product_id)) {
        errors[`links[${i}].product_id`] = "product_id must be a valid UUID";
      }
      if (!isLinkRole(raw.role)) {
        errors[`links[${i}].role`] =
          "role must be one of: hero, featured, related, vs-left, vs-right";
      }
    }
  }

  if (Object.keys(errors).length > 0) return { data: null, errors };
  if (!isUuid(body.content_id)) {
    return { data: null, errors: { content_id: "content_id must be a valid UUID" } };
  }

  const validatedLinks: ContentProductLink[] = [];
  if (Array.isArray(body.links)) {
    for (const raw of body.links) {
      if (isRecord(raw) && isUuid(raw.product_id) && isLinkRole(raw.role)) {
        validatedLinks.push({ product_id: raw.product_id, role: raw.role });
      }
    }
  }

  return {
    data: {
      content_id: body.content_id,
      links: validatedLinks,
    },
    errors: null,
  };
}
