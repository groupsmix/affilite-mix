import { getPageBySlug } from "@/lib/dal/pages";
import {
  calmAuthor,
  calmCategories,
  calmCategoryBadge,
  calmPosts,
  calmProductGroups,
  calmProducts,
  type CalmAuthor,
  type CalmCategorySlug,
  type CalmPost,
  type CalmProduct,
  type CalmProductCategory,
} from "@/lib/calmroutine";

export type { CalmAuthor, CalmCategorySlug, CalmPost, CalmProduct, CalmProductCategory };

export interface CalmSiteConfig {
  author: CalmAuthor;
  categories: Record<CalmCategorySlug, { slug: CalmCategorySlug; name: string; intro: string }>;
  categoryBadge: Record<CalmCategorySlug, { label: string; bg: string; text: string }>;
  posts: CalmPost[];
  productGroups: { category: CalmProductCategory; name: string; intro: string }[];
  products: CalmProduct[];
}

export const CALM_CONFIG_SLUG = "calm-site-config";

export const defaultCalmConfig: CalmSiteConfig = {
  author: calmAuthor,
  categories: calmCategories,
  categoryBadge: calmCategoryBadge,
  posts: calmPosts,
  productGroups: calmProductGroups,
  products: calmProducts,
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isCategorySlug(value: unknown): value is CalmCategorySlug {
  return value === "reset-routines" || value === "somatic-practices" || value === "reviews";
}

function isProductCategory(value: unknown): value is CalmProductCategory {
  return value === "sleep-and-calm" || value === "supplements" || value === "devices";
}

function isValidPriceTier(value: unknown): value is "$" | "$$" | "$$$" {
  return value === "$" || value === "$$" || value === "$$$";
}

function coerceAuthor(raw: unknown): CalmAuthor | null {
  if (!isObject(raw)) return null;
  const { id, name, bio, avatarUrl, credentialLine } = raw;
  if (
    !isString(id) ||
    !isString(name) ||
    !isString(bio) ||
    !isString(avatarUrl) ||
    !isString(credentialLine)
  ) {
    return null;
  }
  return { id, name, bio, avatarUrl, credentialLine };
}

function coerceCategories(raw: unknown): CalmSiteConfig["categories"] | null {
  if (!isObject(raw)) return null;
  const out: Partial<CalmSiteConfig["categories"]> = {};
  for (const key of ["reset-routines", "somatic-practices", "reviews"] as CalmCategorySlug[]) {
    const item = raw[key];
    if (!isObject(item)) return null;
    const slug = item.slug;
    const name = item.name;
    const intro = item.intro;
    if (!isCategorySlug(slug) || !isString(name) || !isString(intro)) return null;
    out[key] = { slug, name, intro };
  }
  return out as CalmSiteConfig["categories"];
}

function coerceCategoryBadge(raw: unknown): CalmSiteConfig["categoryBadge"] | null {
  if (!isObject(raw)) return null;
  const out: Partial<CalmSiteConfig["categoryBadge"]> = {};
  for (const key of ["reset-routines", "somatic-practices", "reviews"] as CalmCategorySlug[]) {
    const item = raw[key];
    if (!isObject(item)) return null;
    const label = item.label;
    const bg = item.bg;
    const text = item.text;
    if (!isString(label) || !isString(bg) || !isString(text)) return null;
    out[key] = { label, bg, text };
  }
  return out as CalmSiteConfig["categoryBadge"];
}

function coerceSection(raw: unknown): {
  heading: string;
  paragraphs: string[];
  affiliate?: { label: string; product: string; note: string };
} | null {
  if (!isObject(raw)) return null;
  const heading = raw.heading;
  const paragraphs = raw.paragraphs;
  if (!isString(heading) || !isStringArray(paragraphs)) return null;
  const affiliateRaw = raw.affiliate;
  let affiliate: { label: string; product: string; note: string } | undefined;
  if (affiliateRaw !== undefined) {
    if (!isObject(affiliateRaw)) return null;
    const label = affiliateRaw.label;
    const product = affiliateRaw.product;
    const note = affiliateRaw.note;
    if (!isString(label) || !isString(product) || !isString(note)) return null;
    affiliate = { label, product, note };
  }
  return { heading, paragraphs, affiliate };
}

function coercePost(raw: unknown): CalmPost | null {
  if (!isObject(raw)) return null;
  const slug = raw.slug;
  const title = raw.title;
  const excerpt = raw.excerpt;
  const category = raw.category;
  const authorId = raw.authorId;
  const publishedAt = raw.publishedAt;
  const readTimeMinutes = raw.readTimeMinutes;
  const featuredImage = raw.featuredImage;
  const seoTitle = raw.seoTitle;
  const seoDescription = raw.seoDescription;
  const bodyRaw = raw.body;
  if (
    !isString(slug) ||
    !isString(title) ||
    !isString(excerpt) ||
    !isCategorySlug(category) ||
    !isString(authorId) ||
    !isString(publishedAt) ||
    typeof readTimeMinutes !== "number" ||
    Number.isNaN(readTimeMinutes) ||
    !isString(featuredImage) ||
    !isString(seoTitle) ||
    !isString(seoDescription) ||
    !Array.isArray(bodyRaw)
  ) {
    return null;
  }
  const body: CalmPost["body"] = [];
  for (const section of bodyRaw) {
    const coerced = coerceSection(section);
    if (!coerced) return null;
    body.push(coerced);
  }
  return {
    slug,
    title,
    excerpt,
    category,
    authorId,
    publishedAt,
    readTimeMinutes,
    featuredImage,
    seoTitle,
    seoDescription,
    body,
  };
}

function coerceProduct(raw: unknown): CalmProduct | null {
  if (!isObject(raw)) return null;
  const id = raw.id;
  const name = raw.name;
  const imageUrl = raw.imageUrl;
  const oneLineNote = raw.oneLineNote;
  const category = raw.category;
  const priceTier = raw.priceTier;
  const destinationUrl = raw.destinationUrl;
  const relatedPostSlug = raw.relatedPostSlug;
  if (
    !isString(id) ||
    !isString(name) ||
    !isString(imageUrl) ||
    !isString(oneLineNote) ||
    !isProductCategory(category) ||
    !isValidPriceTier(priceTier) ||
    !isString(destinationUrl)
  ) {
    return null;
  }
  return {
    id,
    name,
    imageUrl,
    oneLineNote,
    category,
    priceTier,
    destinationUrl,
    relatedPostSlug: isString(relatedPostSlug) ? relatedPostSlug : undefined,
  };
}

function coerceProductGroup(raw: unknown): CalmSiteConfig["productGroups"][number] | null {
  if (!isObject(raw)) return null;
  const category = raw.category;
  const name = raw.name;
  const intro = raw.intro;
  if (!isProductCategory(category) || !isString(name) || !isString(intro)) return null;
  return { category, name, intro };
}

export function mergeCalmConfig(source: unknown): CalmSiteConfig {
  const src = isObject(source) ? source : {};

  const author = coerceAuthor(src.author) ?? defaultCalmConfig.author;
  const categories = coerceCategories(src.categories) ?? defaultCalmConfig.categories;
  const categoryBadge = coerceCategoryBadge(src.categoryBadge) ?? defaultCalmConfig.categoryBadge;

  const postsRaw = src.posts;
  const posts =
    Array.isArray(postsRaw) && postsRaw.length > 0
      ? postsRaw.map(coercePost).filter((p): p is CalmPost => p !== null)
      : defaultCalmConfig.posts;

  const productGroupsRaw = src.productGroups;
  const productGroups =
    Array.isArray(productGroupsRaw) && productGroupsRaw.length > 0
      ? productGroupsRaw
          .map(coerceProductGroup)
          .filter((g): g is CalmSiteConfig["productGroups"][number] => g !== null)
      : defaultCalmConfig.productGroups;

  const productsRaw = src.products;
  const products =
    Array.isArray(productsRaw) && productsRaw.length > 0
      ? productsRaw.map(coerceProduct).filter((p): p is CalmProduct => p !== null)
      : defaultCalmConfig.products;

  return { author, categories, categoryBadge, posts, productGroups, products };
}

export async function getCalmConfig(siteId: string): Promise<CalmSiteConfig> {
  const page = await getPageBySlug(siteId, CALM_CONFIG_SLUG);
  if (!page?.body) return defaultCalmConfig;
  try {
    const parsed = JSON.parse(page.body) as unknown;
    return mergeCalmConfig(parsed);
  } catch {
    return defaultCalmConfig;
  }
}

export function getCalmPost(config: CalmSiteConfig, slug: string): CalmPost | undefined {
  return config.posts.find((p) => p.slug === slug);
}

export function getCalmPostsByCategory(
  config: CalmSiteConfig,
  category: CalmCategorySlug,
): CalmPost[] {
  return config.posts.filter((p) => p.category === category);
}

export function getCalmProductsByCategory(
  config: CalmSiteConfig,
  category: CalmProductCategory,
): CalmProduct[] {
  return config.products.filter((p) => p.category === category);
}
