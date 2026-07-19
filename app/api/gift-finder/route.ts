import { NextRequest, NextResponse } from "next/server";
import { getCurrentSite } from "@/lib/site-context";
import { getTenantClient } from "@/lib/supabase-server";
import { captureException } from "@/lib/sentry";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { getContentLinkedToProducts } from "@/lib/dal/content-products";
import { isPlaceholderAffiliateUrl } from "@/lib/affiliate-url";

/** 30 gift-finder requests per minute per IP
 * P0-5: failPolicy: "closed" — database-driven recommendation endpoint.
 * Note: Despite early design docs, this endpoint uses DB queries with
 * relevance scoring, NOT AI provider calls. No per-call AI costs apply.
 */
const GIFT_FINDER_RATE_LIMIT = {
  maxRequests: 30,
  windowMs: 60 * 1000,
  failPolicy: "closed" as const,
};

/** Parse a numeric amount out of a display price label like "$295" or "1,299 USD". */
function parsePriceLabel(label: string | null): number | null {
  if (!label) return null;
  const match = label.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  if (!match?.[1]) return null;
  const parsed = parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * GET /api/gift-finder?budget=500&occasion=birthday&recipient=husband&style=classic
 *
 * Returns up to 3 product recommendations from the database, scored by
 * relevance to the provided gift-finder parameters. Replaces the previous
 * hardcoded inline product list.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = await checkRateLimit(`gift-finder:${ip}`, GIFT_FINDER_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  const site = await getCurrentSite();
  if (!site.features.giftFinder) {
    return NextResponse.json(
      { error: "Gift finder is not enabled for this site" },
      { status: 404 },
    );
  }

  const { searchParams } = request.nextUrl;

  // Validate budget to prevent NaN bypass
  let budget = parseInt(searchParams.get("budget") ?? "9999", 10);
  if (isNaN(budget)) {
    budget = 9999; // Default to no budget limit if invalid
  }
  budget = Math.min(100000, Math.max(0, budget));

  // AM-12: Cap query param length and restrict to safe characters
  const MAX_PARAM_LEN = 100;
  const SAFE_PARAM_RE = /^[a-zA-Z0-9 _-]*$/;

  const rawOccasion = searchParams.get("occasion") ?? "";
  const rawRecipient = searchParams.get("recipient") ?? "";
  const rawStyle = searchParams.get("style") ?? "";

  if (
    rawOccasion.length > MAX_PARAM_LEN ||
    rawRecipient.length > MAX_PARAM_LEN ||
    rawStyle.length > MAX_PARAM_LEN
  ) {
    return NextResponse.json({ error: "Query parameters exceed maximum length" }, { status: 400 });
  }
  if (
    !SAFE_PARAM_RE.test(rawOccasion) ||
    !SAFE_PARAM_RE.test(rawRecipient) ||
    !SAFE_PARAM_RE.test(rawStyle)
  ) {
    return NextResponse.json(
      { error: "Query parameters contain invalid characters" },
      { status: 400 },
    );
  }

  const occasion = rawOccasion.toLowerCase();
  const recipient = rawRecipient.toLowerCase();
  const style = rawStyle.toLowerCase();

  const dbSiteId = site.id; // site.id is already the resolved DB UUID
  const sb = await getTenantClient();

  // Fetch active products within budget. Score may be null; it is defaulted
  // during ranking so products without an explicit score are not silently
  // excluded from the gift finder.
  let query = sb
    // eslint-disable-next-line no-restricted-syntax -- Audited: uses site-scoped getTenantClient() (RLS-enforced)
    .from("products")
    .select(
      "id, name, slug, price_label, price_amount, price_currency, score, affiliate_url, image_url, description, merchant, deal_text, category_id, category_ids",
    )
    .eq("site_id", dbSiteId)
    .eq("status", "active");

  if (budget < 9999) {
    // Products without a numeric price_amount still carry a display price in
    // price_label; keep them here and enforce the budget on the parsed label
    // below, so label-only products are not silently excluded.
    query = query.or(`price_amount.lte.${budget},price_amount.is.null`);
  }

  const { data: products, error } = await query
    .order("score", { ascending: false, nullsFirst: false })
    .limit(50);

  if (error) {
    captureException(error, { context: "[api/gift-finder] query failed:" });
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }

  if (!products || products.length === 0) {
    return NextResponse.json({ results: [] });
  }

  // Enforce the budget for label-only products (price_amount is null). A
  // product with an unparseable label is kept rather than silently dropped.
  const withinBudget =
    budget < 9999
      ? products.filter((p: { price_amount: number | null; price_label: string | null }) => {
          if (p.price_amount !== null) return true;
          const parsed = parsePriceLabel(p.price_label);
          return parsed === null || parsed <= budget;
        })
      : products;

  // Fetch taxonomy categories for scoring across every gift-finder dimension.
  const { data: categories } = await sb
    // eslint-disable-next-line no-restricted-syntax -- Audited: uses site-scoped getTenantClient() (RLS-enforced)
    .from("categories")
    .select("id, slug, taxonomy_type")
    .eq("site_id", dbSiteId)
    .neq("taxonomy_type", "budget");

  // Build lookup: category_id -> { slug, taxonomy_type }
  const categoryMap = new Map<string, { slug: string; taxonomy_type: string }>(
    (categories ?? []).map((c: { id: string; slug: string; taxonomy_type: string }) => [
      c.id,
      { slug: c.slug, taxonomy_type: c.taxonomy_type },
    ]),
  );

  // Score and rank products
  interface ProductResult {
    id: string;
    name: string;
    slug: string;
    price_label: string | null;
    price_amount: number | null;
    price_currency: string | null;
    score: number | null;
    affiliate_url: string | null;
    image_url: string | null;
    description: string | null;
    merchant: string | null;
    deal_text: string | null;
    category_id: string | null;
    category_ids: string[] | null;
  }
  type ScoredProduct = ProductResult & { relevance: number };
  const scored: ScoredProduct[] = (withinBudget as ProductResult[]).map((p) => {
    let relevance = (p.score ?? 5) * 10;

    // A product can now be tagged against multiple categories (occasion,
    // recipient, style, etc.). Score each matching dimension independently.
    const productCategoryIds = p.category_ids?.length
      ? p.category_ids
      : p.category_id
        ? [p.category_id]
        : [];
    for (const categoryId of productCategoryIds) {
      const cat = categoryMap.get(categoryId);
      if (!cat) continue;

      if (cat.taxonomy_type === "occasion" && cat.slug === occasion) relevance += 15;
      if (cat.taxonomy_type === "recipient" && cat.slug === recipient) relevance += 20;
      if (cat.taxonomy_type === "style" && cat.slug === style) relevance += 15;
      // General/brand slugs that happen to match a dimension still count, but
      // with a smaller weight to avoid distorting the taxonomy-first signal.
      if (cat.slug === occasion || cat.slug === recipient || cat.slug === style) relevance += 5;
    }

    // Text-based style matching from name/description
    if (
      style &&
      (p.name?.toLowerCase().includes(style) || p.description?.toLowerCase().includes(style))
    ) {
      relevance += 10;
    }

    return { ...p, relevance };
  });

  scored.sort((a, b) => b.relevance - a.relevance);

  const top = scored
    .filter((p) => p.slug && !isPlaceholderAffiliateUrl(p.affiliate_url))
    .slice(0, 3);

  // Resolve the published review (if any) for each recommended product so the
  // "Read Full Review" button links to the real review page instead of a
  // top-level slug that 404s. Products without a review omit the link.
  const reviewUrlByProduct = new Map<string, string>();
  try {
    const linked = await getContentLinkedToProducts(
      dbSiteId,
      top.map((p) => p.id),
      { types: ["review"] },
    );
    for (const { productId, content } of linked) {
      if (!reviewUrlByProduct.has(productId) && content.slug) {
        reviewUrlByProduct.set(productId, `/${content.type}/${content.slug}`);
      }
    }
  } catch (reviewErr) {
    // Non-fatal: recommendations are still useful without the review link.
    captureException(reviewErr, { context: "[api/gift-finder] review link lookup failed" });
  }

  // Issue 8: suppress raw affiliate_url and replace with a /r/ redirect URL.
  // Exposing affiliate_url publicly lets competitors identify networks and strip
  // tracking parameters. Route traffic through the internal /r/[slug] redirect
  // instead so the affiliate URL is never sent to the browser.
  const results = top.map((p) => ({
    name: p.name,
    slug: p.slug,
    price_label: p.price_label,
    price_amount: p.price_amount,
    price_currency: p.price_currency,
    score: p.score,
    image_url: p.image_url,
    description: p.description,
    merchant: p.merchant,
    deal_text: p.deal_text,
    // Include redirect_url only when the product has a non-empty slug.
    ...(p.slug ? { redirect_url: `/r/${p.slug}` } : {}),
    // Only present when a published review exists for this product.
    ...(reviewUrlByProduct.has(p.id) ? { review_url: reviewUrlByProduct.get(p.id) } : {}),
  }));

  return NextResponse.json({ results });
}
