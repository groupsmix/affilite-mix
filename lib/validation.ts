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

// ── Categories ────────────────────────────────────────────

const TAXONOMY_TYPES = new Set(["general", "budget", "occasion", "recipient", "brand"]);

export interface CreateCategoryInput {
  name: string;
  slug: string;
  description: string;
  taxonomy_type: "general" | "budget" | "occasion" | "recipient" | "brand";
}

export function validateCreateCategory(body: Record<string, unknown>): ValidationResult<CreateCategoryInput> {
  const errors: Record<string, string> = {};

  if (!isString(body.name) || body.name.length < 1 || body.name.length > 200) {
    errors.name = "name must be a string between 1 and 200 characters";
  }
  if (!isSlug(body.slug) || (body.slug as string).length > 200) {
    errors.slug = "slug must be a lowercase alphanumeric string with hyphens, max 200 chars";
  }

  if (body.taxonomy_type !== undefined && !TAXONOMY_TYPES.has(body.taxonomy_type as string)) {
    errors.taxonomy_type = "taxonomy_type must be one of: general, budget, occasion, recipient, brand";
  }

  if (Object.keys(errors).length > 0) return { data: null, errors };
  return {
    data: {
      name: body.name as string,
      slug: body.slug as string,
      description: isString(body.description) ? body.description : "",
      taxonomy_type: (TAXONOMY_TYPES.has(body.taxonomy_type as string) ? body.taxonomy_type : "general") as CreateCategoryInput["taxonomy_type"],
    },
    errors: null,
  };
}

export interface UpdateCategoryInput {
  id: string;
  name?: string;
  slug?: string;
  description?: string;
  taxonomy_type?: "general" | "budget" | "occasion" | "recipient" | "brand";
}

export function validateUpdateCategory(body: Record<string, unknown>): ValidationResult<UpdateCategoryInput> {
  const errors: Record<string, string> = {};

  if (!isUuid(body.id)) {
    errors.id = "id must be a valid UUID";
  }
  if (body.name !== undefined && (!isString(body.name) || body.name.length < 1 || body.name.length > 200)) {
    errors.name = "name must be a string between 1 and 200 characters";
  }
  if (body.slug !== undefined && (!isSlug(body.slug) || (body.slug as string).length > 200)) {
    errors.slug = "slug must be a lowercase alphanumeric string with hyphens, max 200 chars";
  }

  if (body.taxonomy_type !== undefined && !TAXONOMY_TYPES.has(body.taxonomy_type as string)) {
    errors.taxonomy_type = "taxonomy_type must be one of: general, budget, occasion, recipient, brand";
  }

  if (Object.keys(errors).length > 0) return { data: null, errors };
  const data: UpdateCategoryInput = { id: body.id as string };
  if (body.name !== undefined) data.name = body.name as string;
  if (body.slug !== undefined) data.slug = body.slug as string;
  if (body.description !== undefined) data.description = body.description as string;
  if (body.taxonomy_type !== undefined) data.taxonomy_type = body.taxonomy_type as UpdateCategoryInput["taxonomy_type"];
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

export function validateCreateProduct(body: Record<string, unknown>): ValidationResult<CreateProductInput> {
  const errors: Record<string, string> = {};

  if (!isString(body.name) || body.name.length < 1 || body.name.length > 200) {
    errors.name = "name must be a string between 1 and 200 characters";
  }
  if (!isSlug(body.slug) || (body.slug as string).length > 200) {
    errors.slug = "slug must be a lowercase alphanumeric string with hyphens, max 200 chars";
  }
  if (body.description !== undefined && body.description !== "" && !isString(body.description)) {
    errors.description = "description must be a string";
  }
  if (body.affiliate_url !== undefined && body.affiliate_url !== "" && !isUrl(body.affiliate_url)) {
    errors.affiliate_url = "affiliate_url must be a valid URL or empty string";
  }
  if (body.image_url !== undefined && body.image_url !== "" && !isUrl(body.image_url)) {
    errors.image_url = "image_url must be a valid URL or empty string";
  }
  if (isString(body.image_url) && body.image_url !== "" && (!isString(body.image_alt) || body.image_alt.trim() === "")) {
    errors.image_alt = "image_alt is required when image_url is provided — describe what is shown in the image, not just the product name";
  }
  if (body.price !== undefined && !isString(body.price)) {
    errors.price = "price must be a string";
  }
  if (body.merchant !== undefined && !isString(body.merchant)) {
    errors.merchant = "merchant must be a string";
  }
  if (body.score !== undefined && body.score !== null && (!isNumber(body.score) || body.score < 0 || body.score > 10)) {
    errors.score = "score must be a number between 0 and 10, or null";
  }
  if (body.status !== undefined && !PRODUCT_STATUSES.has(body.status as string)) {
    errors.status = "status must be one of: draft, active, archived";
  }
  if (body.category_id !== undefined && body.category_id !== null && !isUuid(body.category_id)) {
    errors.category_id = "category_id must be a valid UUID or null";
  }

  if (Object.keys(errors).length > 0) return { data: null, errors };
  return {
    data: {
      name: body.name as string,
      slug: body.slug as string,
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
      status: (PRODUCT_STATUSES.has(body.status as string) ? body.status : "active") as "draft" | "active" | "archived",
      category_id: isUuid(body.category_id) ? (body.category_id as string) : null,
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
  status?: "draft" | "active" | "archived";
  category_id?: string | null;
  cta_text?: string;
  deal_text?: string;
  deal_expires_at?: string | null;
  pros?: string;
  cons?: string;
}

export function validateUpdateProduct(body: Record<string, unknown>): ValidationResult<UpdateProductInput> {
  const errors: Record<string, string> = {};

  if (!isUuid(body.id)) {
    errors.id = "id must be a valid UUID";
  }
  if (body.name !== undefined && (!isString(body.name) || body.name.length < 1 || body.name.length > 200)) {
    errors.name = "name must be a string between 1 and 200 characters";
  }
  if (body.slug !== undefined && (!isSlug(body.slug) || (body.slug as string).length > 200)) {
    errors.slug = "slug must be a lowercase alphanumeric string with hyphens, max 200 chars";
  }
  if (body.score !== undefined && body.score !== null && (!isNumber(body.score) || body.score < 0 || body.score > 10)) {
    errors.score = "score must be a number between 0 and 10, or null";
  }
  if (body.status !== undefined && !PRODUCT_STATUSES.has(body.status as string)) {
    errors.status = "status must be one of: draft, active, archived";
  }
  if (body.category_id !== undefined && body.category_id !== null && !isUuid(body.category_id)) {
    errors.category_id = "category_id must be a valid UUID or null";
  }

  if (Object.keys(errors).length > 0) return { data: null, errors };

  const data: UpdateProductInput = { id: body.id as string };
  if (body.name !== undefined) data.name = body.name as string;
  if (body.slug !== undefined) data.slug = body.slug as string;
  if (body.description !== undefined) data.description = body.description as string;
  if (body.affiliate_url !== undefined) data.affiliate_url = body.affiliate_url as string;
  if (body.image_url !== undefined) data.image_url = body.image_url as string;
  if (body.image_alt !== undefined) data.image_alt = body.image_alt as string;
  if (body.price !== undefined) data.price = body.price as string;
  if (body.price_amount !== undefined) data.price_amount = body.price_amount as number | null;
  if (body.price_currency !== undefined) data.price_currency = body.price_currency as string;
  if (body.merchant !== undefined) data.merchant = body.merchant as string;
  if (body.score !== undefined) data.score = body.score as number | null;
  if (body.featured !== undefined) data.featured = body.featured as boolean;
  if (body.status !== undefined) data.status = body.status as "draft" | "active" | "archived";
  if (body.category_id !== undefined) data.category_id = body.category_id as string | null;
  if (body.cta_text !== undefined) data.cta_text = body.cta_text as string;
  if (body.deal_text !== undefined) data.deal_text = body.deal_text as string;
  if (body.deal_expires_at !== undefined) data.deal_expires_at = body.deal_expires_at as string | null;
  if (body.pros !== undefined) data.pros = body.pros as string;
  if (body.cons !== undefined) data.cons = body.cons as string;
  return { data, errors: null };
}

// ── Content ───────────────────────────────────────────────

export const CONTENT_TYPES = new Set(["article", "review", "comparison", "guide", "blog"]);

export interface CreateContentInput {
  title: string;
  slug: string;
  body: string;
  excerpt: string;
  featured_image: string;
  type: "article" | "review" | "comparison" | "guide" | "blog";
  status: "draft" | "review" | "scheduled" | "published" | "archived";
  category_id: string | null;
  tags: string[];
  author: string | null;
  publish_at: string | null;
  meta_title: string | null;
  meta_description: string | null;
  og_image: string | null;
}

const CONTENT_STATUSES = new Set(["draft", "review", "scheduled", "published", "archived"]);

export function validateCreateContent(body: Record<string, unknown>): ValidationResult<CreateContentInput> {
  const errors: Record<string, string> = {};

  if (!isString(body.title) || body.title.length < 1 || body.title.length > 500) {
    errors.title = "title must be a string between 1 and 500 characters";
  }
  if (!isSlug(body.slug) || (body.slug as string).length > 500) {
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
  if (body.status !== undefined && !CONTENT_STATUSES.has(body.status as string)) {
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
      title: body.title as string,
      slug: body.slug as string,
      body: isString(body.body) ? body.body : "",
      excerpt: isString(body.excerpt) ? body.excerpt : "",
      featured_image: isString(body.featured_image) ? body.featured_image : "",
      type: (CONTENT_TYPES.has(body.type as string) ? body.type : "article") as CreateContentInput["type"],
      status: (CONTENT_STATUSES.has(body.status as string) ? body.status : "draft") as CreateContentInput["status"],
      category_id: isUuid(body.category_id) ? (body.category_id as string) : null,
      tags: Array.isArray(body.tags) ? (body.tags as string[]) : [],
      author: isString(body.author) ? body.author : null,
      publish_at: isString(body.publish_at) && body.publish_at !== "" ? body.publish_at : null,
      meta_title: isString(body.meta_title) && body.meta_title !== "" ? body.meta_title : null,
      meta_description: isString(body.meta_description) && body.meta_description !== "" ? body.meta_description : null,
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
  type?: string;
  status?: "draft" | "review" | "scheduled" | "published" | "archived";
  category_id?: string | null;
  tags?: string[];
  author?: string | null;
  publish_at?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  og_image?: string | null;
}

export function validateUpdateContent(body: Record<string, unknown>): ValidationResult<UpdateContentInput> {
  const errors: Record<string, string> = {};

  if (!isUuid(body.id)) {
    errors.id = "id must be a valid UUID";
  }
  if (body.title !== undefined && (!isString(body.title) || body.title.length < 1 || body.title.length > 500)) {
    errors.title = "title must be a string between 1 and 500 characters";
  }
  if (body.slug !== undefined && (!isSlug(body.slug) || (body.slug as string).length > 500)) {
    errors.slug = "slug must be a lowercase alphanumeric string with hyphens, max 500 chars";
  }
  if (body.body !== undefined && !isString(body.body)) {
    errors.body = "body must be a string";
  }
  if (body.body !== undefined && isString(body.body) && body.body.length > 500_000) {
    errors.body = "body must be less than 500,000 characters";
  }
  if (body.status !== undefined && !CONTENT_STATUSES.has(body.status as string)) {
    errors.status = "status must be one of: draft, review, scheduled, published, archived";
  }
  if (body.category_id !== undefined && body.category_id !== null && !isUuid(body.category_id)) {
    errors.category_id = "category_id must be a valid UUID or null";
  }

  if (Object.keys(errors).length > 0) return { data: null, errors };

  const data: UpdateContentInput = { id: body.id as string };
  if (body.title !== undefined) data.title = body.title as string;
  if (body.slug !== undefined) data.slug = body.slug as string;
  if (body.body !== undefined) data.body = body.body as string;
  if (body.excerpt !== undefined) data.excerpt = body.excerpt as string;
  if (body.featured_image !== undefined) data.featured_image = body.featured_image as string;
  if (body.type !== undefined) data.type = body.type as string;
  if (body.status !== undefined) data.status = body.status as UpdateContentInput["status"];
  if (body.category_id !== undefined) data.category_id = body.category_id as string | null;
  if (body.tags !== undefined) data.tags = body.tags as string[];
  if (body.author !== undefined) data.author = body.author as string | null;
  if (body.publish_at !== undefined) data.publish_at = body.publish_at as string | null;
  if (body.meta_title !== undefined) data.meta_title = isString(body.meta_title) && body.meta_title !== "" ? body.meta_title : null;
  if (body.meta_description !== undefined) data.meta_description = isString(body.meta_description) && body.meta_description !== "" ? body.meta_description : null;
  if (body.og_image !== undefined) data.og_image = isString(body.og_image) && body.og_image !== "" ? body.og_image : null;
  return { data, errors: null };
}

// ── Content-Products ──────────────────────────────────────

const LINK_ROLES = new Set(["hero", "featured", "related", "vs-left", "vs-right"]);

export interface ContentProductLink {
  product_id: string;
  role: "hero" | "featured" | "related" | "vs-left" | "vs-right";
}

export interface SetLinkedProductsInput {
  content_id: string;
  links: ContentProductLink[];
}

export function validateSetLinkedProducts(body: Record<string, unknown>): ValidationResult<SetLinkedProductsInput> {
  const errors: Record<string, string> = {};

  if (!isUuid(body.content_id)) {
    errors.content_id = "content_id must be a valid UUID";
  }

  if (body.links !== undefined && !Array.isArray(body.links)) {
    errors.links = "links must be an array";
  } else if (Array.isArray(body.links)) {
    for (let i = 0; i < body.links.length; i++) {
      const link = body.links[i] as Record<string, unknown>;
      if (!isUuid(link.product_id)) {
        errors[`links[${i}].product_id`] = "product_id must be a valid UUID";
      }
      if (!isString(link.role) || !LINK_ROLES.has(link.role)) {
        errors[`links[${i}].role`] = "role must be one of: hero, featured, related, vs-left, vs-right";
      }
    }
  }

  if (Object.keys(errors).length > 0) return { data: null, errors };
  return {
    data: {
      content_id: body.content_id as string,
      links: Array.isArray(body.links) ? (body.links as ContentProductLink[]) : [],
    },
    errors: null,
  };
}
