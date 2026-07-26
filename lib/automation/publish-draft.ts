/**
 * Shared promotion logic: turn an AI draft into a live content row.
 * Used by both POST /content/drafts/:id/publish and PATCH with status "published".
 */
import { getAutomationDbClient } from "./db";
import type { DalClientGetter } from "@/lib/dal/dal-client";
import { getAIDraft, updateAIDraft } from "@/lib/dal/ai-drafts";
import { getContentBySlug, createContent, updateContent } from "@/lib/dal/content";
import { listProducts } from "@/lib/dal/products";
import { setLinkedProducts } from "@/lib/dal/content-products";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { recordAuditEvent } from "@/lib/audit-log";
import { injectAffiliateShortcodeLinks } from "@/lib/affiliate/link-injection";
import { deriveMetaDescription, deriveMetaTitle } from "@/lib/seo/auto-meta";
import { humanizeAuthorName, stripAiDisclosure } from "@/lib/human-content";
import { getSiteById } from "@/config/sites";
import type { AIDraftRow } from "@/lib/dal/ai-drafts";
import type { ContentRow } from "@/types/database";

const VALID_CONTENT_TYPES: ContentRow["type"][] = [
  "article",
  "review",
  "comparison",
  "guide",
  "blog",
];

const SLUG_SUFFIX_MAX = 100;

export interface PublishDraftOverrides {
  title?: string;
  slug?: string;
  excerpt?: string;
  body?: string;
  content_type?: string;
  meta_title?: string | null;
  meta_description?: string | null;
}

export interface PublishDraftResult {
  content: ContentRow;
  draft: AIDraftRow;
}

/** Find a unique slug by appending -2, -3, ... if the base is taken. */
async function resolveUniqueSlug(
  siteId: string,
  baseSlug: string,
  getClient: DalClientGetter,
): Promise<string> {
  let candidate = baseSlug;
  let suffix = 2;
  while (suffix <= SLUG_SUFFIX_MAX) {
    const existing = await getContentBySlug(siteId, candidate, true, getClient);
    if (!existing) return candidate;
    candidate = `${baseSlug}-${suffix}`;
    suffix++;
  }
  throw new Error(`Could not resolve slug conflict for ${baseSlug}`);
}

/**
 * Promote an AI draft to live content.
 * - Tenant-isolated fetch of the draft.
 * - Applies optional overrides (title, slug, excerpt, body, content_type, meta).
 * - Resolves slug collisions by appending a numeric suffix.
 * - Creates a new content row (or updates an existing one found by final slug).
 * - Marks the ai_draft as published.
 */
export async function publishDraft(
  siteId: string,
  draftId: string,
  actorId: string,
  overrides: PublishDraftOverrides = {},
): Promise<PublishDraftResult> {
  const draft = await getAIDraft(siteId, draftId, getAutomationDbClient);
  if (!draft) {
    const err = new Error("Draft not found");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }

  const contentType = (overrides.content_type ?? draft.content_type) as ContentRow["type"];
  if (!VALID_CONTENT_TYPES.includes(contentType)) {
    const err = new Error(
      `Unsupported content_type: ${overrides.content_type ?? draft.content_type}`,
    );
    (err as Error & { status?: number }).status = 422;
    throw err;
  }

  const site = getSiteById(siteId);
  const title = stripAiDisclosure(overrides.title ?? draft.title);
  const excerpt = stripAiDisclosure(overrides.excerpt ?? draft.excerpt);
  let body = stripAiDisclosure(
    overrides.body ? sanitizeHtml(overrides.body) : sanitizeHtml(draft.body),
  );
  const metaTitle = stripAiDisclosure(
    deriveMetaTitle({
      title,
      metaTitle: overrides.meta_title ?? draft.meta_title,
    }),
  );
  const metaDescription = stripAiDisclosure(
    deriveMetaDescription({
      metaDescription: overrides.meta_description ?? draft.meta_description,
      excerpt,
      body,
    }) ?? "",
  );
  const slug = await resolveUniqueSlug(siteId, overrides.slug ?? draft.slug, getAutomationDbClient);
  const authorName = humanizeAuthorName("AI", site?.name ?? "");

  // Auto-wire affiliate shortcode links: match product names in the body and
  // insert `/r/<slug>?ref=<contentSlug>` links with the site's network tracking
  // key (e.g. CJ `sid`) when one is configured.
  const activeProducts = await listProducts({ siteId, status: "active" }, getAutomationDbClient);
  const { html: linkedBody, linkedProducts } = await injectAffiliateShortcodeLinks({
    siteId,
    contentSlug: slug,
    html: body,
    products: activeProducts,
    getClient: getAutomationDbClient,
  });
  body = linkedBody;

  const now = new Date().toISOString();

  const existing = await getContentBySlug(siteId, slug, true, getAutomationDbClient);

  let content: ContentRow;
  if (existing) {
    // This can happen if a row with the resolved slug was created between the
    // uniqueness check and insert. Update it so the publish stays idempotent.
    content = await updateContent(
      siteId,
      existing.id,
      {
        title,
        slug,
        body,
        excerpt,
        type: contentType,
        status: "published",
        tags: draft.keywords,
        author: authorName,
        publish_at: now,
        meta_title: metaTitle,
        meta_description: metaDescription,
        review_state: "published",
        ai_generated: true,
        human_reviewed_at: now,
      },
      getAutomationDbClient,
    );
  } else {
    content = await createContent(
      {
        site_id: siteId,
        title,
        slug,
        body,
        excerpt,
        featured_image: "",
        type: contentType,
        status: "published",
        category_id: null,
        tags: draft.keywords,
        author: authorName,
        publish_at: now,
        meta_title: metaTitle,
        meta_description: metaDescription,
        og_image: null,
        body_previous: null,
        review_state: "published",
        ai_generated: true,
        human_reviewed_at: now,
      },
      getAutomationDbClient,
    );
  }

  const publishedDraft = await updateAIDraft(
    siteId,
    draftId,
    {
      status: "published",
      reviewed_at: now,
      reviewed_by: `agent:${actorId}`,
      ...(overrides.title ? { title: overrides.title } : {}),
      ...(overrides.slug ? { slug } : {}),
      ...(overrides.excerpt ? { excerpt: overrides.excerpt } : {}),
      ...(overrides.body ? { body: overrides.body } : {}),
      ...(overrides.content_type ? { content_type: overrides.content_type } : {}),
      ...(overrides.meta_title !== undefined ? { meta_title: overrides.meta_title } : {}),
      ...(overrides.meta_description !== undefined
        ? { meta_description: overrides.meta_description }
        : {}),
    },
    getAutomationDbClient,
  );
  if (!publishedDraft) {
    const err = new Error("Draft not found after publish");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }

  // Persist product-content relationships so the public page can render related
  // product cards and the automated contextual internal-link block.
  if (linkedProducts.length > 0) {
    await setLinkedProducts(
      content.id,
      siteId,
      linkedProducts.map((p, idx) => ({
        product_id: p.id,
        role: idx === 0 ? ("hero" as const) : ("featured" as const),
      })),
      getAutomationDbClient,
    );
  }

  await recordAuditEvent({
    site_id: siteId,
    actor: `agent:${actorId}`,
    action: "automation.content.draft.publish",
    entity_type: "ai_draft",
    entity_id: draftId,
    details: {
      content_id: content.id,
      slug: content.slug,
      title: content.title,
      republished: Boolean(existing),
    },
  });

  return { content, draft: publishedDraft };
}
