/**
 * Plain TypeScript input validation helpers (zero dependencies).
 * Each validate* function returns { data, errors } — if errors is non-null
 * the request should be rejected with 400.
 */

// Email validation lives in lib/validate-email.ts (canonical module).
import { isUsableUuid } from "./security/uuid";

// AM-04: Use shared max content body length from sanitizer to prevent mismatch
import { MAX_INPUT_LENGTH as MAX_CONTENT_BODY_LENGTH } from "./sanitize-html";

// FIX-05 (F-010): Affiliate domain allow-list validation
import { validateAffiliateDomain } from "./affiliate-domain-allowlist";

type ValidationResult<T> =
  | { data: T; errors: null }
  | { data: null; errors: Record<string, string> };

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isNumber(v: unknown): v is number {
  return typeof v === "number" && !Number.isNaN(v);
}

/** A29-001: Parse a decimal string into a number with scale validation.
 * Rejects values that would lose precision as JS numbers or exceed DB scale.
 * Accepts: "9.99", "1000.00", "0.10". Rejects: "9.999" (scale > 2), "not-a-number" */
function parseDecimalMoney(v: unknown): number | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const str = typeof v === "number" ? v.toString() : v.trim();
  if (!str || str === "") return null;
  // Allow optional leading sign, digits, optional decimal with up to 2 places
  if (!/^-?\d+(\.\d{1,2})?$/.test(str)) return null;
  const num = Number(str);
  if (!Number.isFinite(num)) return null;
  // A29-001: Validate range fits NUMERIC(12,2)
  if (num < 0 || num > 999999999.99) return null;
  return num;
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

/** V-03: Strip null bytes from string inputs to prevent truncation attacks */
function stripNullBytes(v: string): string {
  return v.replace(/\0/g, "");
}

/**
 * A14-05: NFC-normalise a user-supplied string.
 *
 * Unicode allows the same visible character to be represented in multiple
 * ways (e.g. é as U+00E9 vs e + U+0301).  Without normalisation an attacker
 * can register "admin@example.com" and a visually identical lookalike
 * "admiñ@example.com" as separate identities.  Normalising to NFC (Canonical
 * Decomposition, followed by Canonical Composition) collapses equivalent
 * codepoint sequences so comparisons and uniqueness checks work correctly.
 *
 * Applied to all free-text fields (name, description, title, etc.).
 * NOT applied to opaque tokens, UUIDs, or slugs where NFC has no meaning.
 */
function nfcNormalize(v: string): string {
  return v.normalize("NFC");
}

/**
 * Sanitize a free-text field: strip null bytes then NFC-normalize.
 * Use this instead of bare stripNullBytes() on human-readable text fields.
 */
function sanitizeText(v: string): string {
  return nfcNormalize(stripNullBytes(v));
}

const SLUG_RE = /^[a-z0-9-]+$/;

function isSlug(v: unknown): v is string {
  return isString(v) && SLUG_RE.test(v);
}

function isUuid(v: unknown): v is string {
  return isUsableUuid(v);
}

function isUrl(v: unknown): v is string {
  if (!isString(v)) return false;
  try {
    new URL(v);
    return true;
  } catch {
    // fail-open: best-effort [criticality:non-critical]
    return false;
  }
}

/** Validate that a URL uses the https:// scheme (prevents javascript:, data:, etc.) */
export function isHttpsUrl(v: unknown): v is string {
  if (!isString(v)) return false;
  try {
    const url = new URL(v);
    return url.protocol === "https:";
  } catch {
    // fail-open: best-effort [criticality:non-critical]
    return false;
  }
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((item) => typeof item === "string");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ═══════════════════════════════════════════════════════════════════════════
// A29-005: Currency-specific rounding policy
// ═══════════════════════════════════════════════════════════════════════════

/** Currency rounding modes. Most currencies use half-up;
 * JPY/KRW/CLP/ISK are zero-decimal and always round to integer. */
// ── Enum type guards ─────────────────────────────────────

type TaxonomyType = "general" | "budget" | "occasion" | "recipient" | "brand" | "style";
const TAXONOMY_TYPES: ReadonlySet<string> = new Set([
  "general",
  "budget",
  "occasion",
  "recipient",
  "brand",
  "style",
]);

function isTaxonomyType(v: unknown): v is TaxonomyType {
  return isString(v) && TAXONOMY_TYPES.has(v);
}

function isUuidArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((item) => isUuid(item));
}

type ProductStatus = "draft" | "active" | "archived";
const PRODUCT_STATUSES: ReadonlySet<string> = new Set(["draft", "active", "archived"]);

function isProductStatus(v: unknown): v is ProductStatus {
  return isString(v) && PRODUCT_STATUSES.has(v);
}

type ContentType = "article" | "review" | "comparison" | "guide" | "blog";
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
export const CONTENT_STATUSES: ReadonlySet<string> = new Set([
  "draft",
  "review",
  "scheduled",
  "published",
  "archived",
]);

function isContentStatus(v: unknown): v is ContentStatus {
  return isString(v) && CONTENT_STATUSES.has(v);
}

type ReviewState = "draft" | "awaiting_edit" | "edited" | "published";
const REVIEW_STATES: ReadonlySet<string> = new Set([
  "draft",
  "awaiting_edit",
  "edited",
  "published",
]);

function isReviewState(v: unknown): v is ReviewState {
  return isString(v) && REVIEW_STATES.has(v);
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
      "taxonomy_type must be one of: general, budget, occasion, recipient, brand, style";
  }

  if (
    body.description !== undefined &&
    body.description !== "" &&
    (!isString(body.description) || body.description.length > 100_000)
  ) {
    errors.description = "description must be a string and under 100,000 characters";
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
      "taxonomy_type must be one of: general, budget, occasion, recipient, brand, style";
  }

  if (
    body.description !== undefined &&
    body.description !== "" &&
    (!isString(body.description) || body.description.length > 100_000)
  ) {
    errors.description = "description must be a string and under 100,000 characters";
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
  category_ids: string[];
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
  if (
    body.description !== undefined &&
    body.description !== "" &&
    (!isString(body.description) || body.description.length > 100_000)
  ) {
    errors.description = "description must be a string and under 100,000 characters";
  }
  if (
    body.affiliate_url !== undefined &&
    body.affiliate_url !== "" &&
    !isHttpsUrl(body.affiliate_url)
  ) {
    errors.affiliate_url = "affiliate_url must be a valid HTTPS URL or empty string";
  }
  // FIX-05 (F-010): Validate affiliate_url domain against allow-list
  if (
    body.affiliate_url !== undefined &&
    body.affiliate_url !== "" &&
    isHttpsUrl(body.affiliate_url)
  ) {
    const domainCheck = validateAffiliateDomain(body.affiliate_url);
    if (!domainCheck.allowed) {
      errors.affiliate_url = domainCheck.reason ?? "affiliate_url domain is not on the allow-list";
    }
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
  // A29-001: Accept decimal strings for price_amount; validate scale/precision
  if (body.price_amount !== undefined && body.price_amount !== null) {
    const parsedAmount = parseDecimalMoney(body.price_amount);
    if (parsedAmount === null) {
      errors.price_amount =
        "price_amount must be a valid decimal with at most 2 decimal places (e.g., 9.99) between 0 and 999999999.99";
    }
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
  if (
    body.category_ids !== undefined &&
    body.category_ids !== null &&
    !isUuidArray(body.category_ids)
  ) {
    errors.category_ids = "category_ids must be an array of valid UUIDs";
  }
  // V-04: Validate price_currency as ISO 4217 (3 uppercase letters)
  if (
    body.price_currency !== undefined &&
    body.price_currency !== "" &&
    isString(body.price_currency) &&
    !/^[A-Z]{3}$/.test(body.price_currency)
  ) {
    errors.price_currency = "price_currency must be a valid ISO 4217 code (3 uppercase letters)";
  }
  // V-05: Validate deal_expires_at as a parseable date
  if (
    body.deal_expires_at !== undefined &&
    isString(body.deal_expires_at) &&
    body.deal_expires_at !== "" &&
    isNaN(Date.parse(body.deal_expires_at))
  ) {
    errors.deal_expires_at = "deal_expires_at must be a valid ISO date string";
  }

  if (Object.keys(errors).length > 0) return { data: null, errors };

  if (!isString(body.name) || !isString(body.slug)) {
    return { data: null, errors: { _: "unexpected validation state" } };
  }

  return {
    data: {
      name: sanitizeText(body.name),
      slug: body.slug,
      description: isString(body.description) ? sanitizeText(body.description) : "",
      affiliate_url: isString(body.affiliate_url) ? body.affiliate_url : "",
      image_url: isString(body.image_url) ? body.image_url : "",
      image_alt: isString(body.image_alt) ? sanitizeText(body.image_alt) : "",
      price: isString(body.price) ? body.price : "",
      // A29-001: Parse decimal strings for precise money handling
      price_amount: parseDecimalMoney(body.price_amount),
      price_currency: isString(body.price_currency) ? body.price_currency : "USD",
      merchant: toString(body.merchant),
      score: toNumberOrNull(body.score),
      featured: isBoolean(body.featured) ? body.featured : false,
      status: isProductStatus(body.status) ? body.status : "active",
      category_id: isUuid(body.category_id) ? body.category_id : null,
      category_ids: isUuidArray(body.category_ids) ? body.category_ids : [],
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
  version?: number;
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
  category_ids?: string[];
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

  // A1-A30 audit rec #2: Validate version field for optimistic locking
  if (
    body.version !== undefined &&
    (!isNumber(body.version) || !Number.isInteger(body.version) || body.version < 1)
  ) {
    errors.version = "version must be a positive integer";
  }

  // A1-A30 audit rec #3: Explicitly reject server-managed fields from update payload
  if (body.site_id !== undefined) {
    errors.site_id = "site_id cannot be modified via update";
  }
  if (body.created_at !== undefined) {
    errors.created_at = "created_at cannot be modified via update";
  }
  if (body.updated_at !== undefined) {
    errors.updated_at = "updated_at cannot be modified via update";
  }
  // MA-001: Reject privilege / identity fields (mass-assignment hardening)
  for (const field of [
    "role",
    "roles",
    "is_verified",
    "is_admin",
    "permissions",
    "user_id",
    "login_failed_attempts",
    "login_locked_until",
  ] as const) {
    if (body[field] !== undefined) {
      errors[field] = `${field} cannot be modified via update`;
    }
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
  // FIX-05 (F-010): Validate affiliate_url domain against allow-list
  if (
    body.affiliate_url !== undefined &&
    body.affiliate_url !== "" &&
    isHttpsUrl(body.affiliate_url)
  ) {
    const domainCheck = validateAffiliateDomain(body.affiliate_url);
    if (!domainCheck.allowed) {
      errors.affiliate_url = domainCheck.reason ?? "affiliate_url domain is not on the allow-list";
    }
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
  if (
    body.category_ids !== undefined &&
    body.category_ids !== null &&
    !isUuidArray(body.category_ids)
  ) {
    errors.category_ids = "category_ids must be an array of valid UUIDs";
  }
  // A29-001: Validate price_amount as decimal string in updates too
  if (body.price_amount !== undefined && body.price_amount !== null) {
    const parsedAmount = parseDecimalMoney(body.price_amount);
    if (parsedAmount === null) {
      errors.price_amount =
        "price_amount must be a valid decimal with at most 2 decimal places (e.g., 9.99) between 0 and 999999999.99";
    }
  }

  if (
    body.description !== undefined &&
    body.description !== "" &&
    (!isString(body.description) || body.description.length > 100_000)
  ) {
    errors.description = "description must be a string and under 100,000 characters";
  }
  // V-04: Validate price_currency as ISO 4217 (3 uppercase letters)
  if (
    body.price_currency !== undefined &&
    body.price_currency !== "" &&
    isString(body.price_currency) &&
    !/^[A-Z]{3}$/.test(body.price_currency)
  ) {
    errors.price_currency = "price_currency must be a valid ISO 4217 code (3 uppercase letters)";
  }
  // V-05: Validate deal_expires_at as a parseable date
  if (
    body.deal_expires_at !== undefined &&
    isString(body.deal_expires_at) &&
    body.deal_expires_at !== "" &&
    isNaN(Date.parse(body.deal_expires_at))
  ) {
    errors.deal_expires_at = "deal_expires_at must be a valid ISO date string";
  }
  if (Object.keys(errors).length > 0) return { data: null, errors };
  if (!isUuid(body.id)) return { data: null, errors: { id: "id must be a valid UUID" } };

  const data: UpdateProductInput = { id: body.id };
  // A1-A30 rec #2: Pass validated version for optimistic locking
  if (isNumber(body.version) && Number.isInteger(body.version) && body.version >= 1) {
    data.version = body.version;
  }
  if (isString(body.name)) data.name = sanitizeText(body.name);
  if (isString(body.slug)) data.slug = body.slug;
  if (isString(body.description)) data.description = sanitizeText(body.description);
  if (isString(body.affiliate_url)) data.affiliate_url = body.affiliate_url;
  if (isString(body.image_url)) data.image_url = body.image_url;
  if (isString(body.image_alt)) data.image_alt = body.image_alt;
  if (isString(body.price)) data.price = body.price;
  // A29-001: Parse decimal strings for precise money handling
  if (body.price_amount !== undefined) {
    data.price_amount = parseDecimalMoney(body.price_amount);
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
  if (body.category_ids !== undefined) {
    data.category_ids = isUuidArray(body.category_ids) ? body.category_ids : [];
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
  if (isString(body.body) && body.body.length > MAX_CONTENT_BODY_LENGTH) {
    errors.body = `body must be less than ${MAX_CONTENT_BODY_LENGTH.toLocaleString()} characters`;
  }
  if (body.excerpt !== undefined && (!isString(body.excerpt) || body.excerpt.length > 5000)) {
    errors.excerpt = "excerpt must be a string and under 5000 characters";
  }
  if (body.status !== undefined && !isContentStatus(body.status)) {
    errors.status = "status must be one of: draft, review, scheduled, published, archived";
  }
  if (body.category_id !== undefined && body.category_id !== null && !isUuid(body.category_id)) {
    errors.category_id = "category_id must be a valid UUID or null";
  }
  if (body.tags !== undefined && !Array.isArray(body.tags)) {
    errors.tags = "tags must be an array of strings";
  } else if (Array.isArray(body.tags)) {
    if (body.tags.length > 50) {
      errors.tags = "tags must contain at most 50 items";
    } else if (body.tags.some((t: unknown) => typeof t !== "string" || t.length > 100)) {
      errors.tags = "each tag must be a string of at most 100 characters";
    }
  }

  if (
    body.meta_description !== undefined &&
    body.meta_description !== null &&
    body.meta_description !== "" &&
    (!isString(body.meta_description) || body.meta_description.length > 5000)
  ) {
    errors.meta_description = "meta_description must be a string under 5000 characters";
  }
  if (Object.keys(errors).length > 0) return { data: null, errors };

  if (!isString(body.title) || !isString(body.slug)) {
    return { data: null, errors: { _: "unexpected validation state" } };
  }

  return {
    data: {
      title: sanitizeText(body.title),
      slug: body.slug,
      body: isString(body.body) ? sanitizeText(body.body) : "",
      excerpt: isString(body.excerpt) ? sanitizeText(body.excerpt) : "",
      featured_image: isString(body.featured_image) ? body.featured_image : "",
      type: isContentType(body.type) ? body.type : "article",
      status: isContentStatus(body.status) ? body.status : "draft",
      category_id: isUuid(body.category_id) ? body.category_id : null,
      tags: isStringArray(body.tags) ? body.tags.map(sanitizeText) : [],
      author: isString(body.author) ? sanitizeText(body.author) : null,
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
  review_state?: ReviewState;
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
  // RC-03: Align with sanitizeHtml()'s MAX_INPUT_LENGTH to prevent 500 errors
  // when PATCH sends content between 100k-500k that the sanitizer rejects.
  if (
    body.body !== undefined &&
    isString(body.body) &&
    body.body.length > MAX_CONTENT_BODY_LENGTH
  ) {
    errors.body = `body must be less than ${MAX_CONTENT_BODY_LENGTH.toLocaleString()} characters`;
  }
  if (body.type !== undefined && !isContentType(body.type)) {
    errors.type = "type must be one of: article, review, comparison, guide, blog";
  }
  if (body.status !== undefined && !isContentStatus(body.status)) {
    errors.status = "status must be one of: draft, review, scheduled, published, archived";
  }
  if (body.review_state !== undefined && !isReviewState(body.review_state)) {
    errors.review_state = "review_state must be one of: draft, awaiting_edit, edited, published";
  }
  if (body.category_id !== undefined && body.category_id !== null && !isUuid(body.category_id)) {
    errors.category_id = "category_id must be a valid UUID or null";
  }

  if (body.excerpt !== undefined && (!isString(body.excerpt) || body.excerpt.length > 5000)) {
    errors.excerpt = "excerpt must be a string and under 5000 characters";
  }
  if (
    body.meta_description !== undefined &&
    body.meta_description !== null &&
    body.meta_description !== "" &&
    (!isString(body.meta_description) || body.meta_description.length > 5000)
  ) {
    errors.meta_description = "meta_description must be a string under 5000 characters";
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
  if (isReviewState(body.review_state)) data.review_state = body.review_state;
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
    data.meta_description = toStringOrNull(body.meta_description);
  if (body.og_image !== undefined) data.og_image = toStringOrNull(body.og_image);
  return { data, errors: null };
}

// ── Content-Products ──────────────────────────────────────

interface ContentProductLink {
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
