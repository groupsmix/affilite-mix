import { NextRequest, NextResponse } from "next/server";
import { getCurrentSite } from "@/lib/site-context";
import { getAnonClient } from "@/lib/supabase-server";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import type { ProductRow } from "@/types/database";
import { captureException } from "@/lib/sentry";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";

/** 30 gift-finder requests per minute per IP */
const GIFT_FINDER_RATE_LIMIT = { maxRequests: 30, windowMs: 60 * 1000 };

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
  const budget = Math.min(100000, Math.max(0, parseInt(searchParams.get("budget") ?? "9999", 10)));
  const occasion = searchParams.get("occasion") ?? "";
  const recipient = searchParams.get("recipient") ?? "";
  const style = searchParams.get("style") ?? "";

  const dbSiteId = await resolveDbSiteId(site.id);
  const sb = getAnonClient();

  // Fetch active products within budget
  let query = sb
    .from("products")
    .select(
      "id, name, slug, price, price_amount, price_currency, score, affiliate_url, image_url, description, merchant, deal_text, category_id",
    )
    .eq("site_id", dbSiteId)
    .eq("status", "active")
    .not("score", "is", null);

  if (budget < 9999) {
    query = query.lte("price_amount", budget);
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

  // Fetch taxonomy categories for scoring (occasion, recipient, style matching)
  const { data: categories } = await sb
    .from("categories")
    .select("id, slug, taxonomy_type")
    .eq("site_id", dbSiteId)
    .in("taxonomy_type", ["occasion", "recipient", "general"]);

  // Build lookup: category_id -> { slug, taxonomy_type }
  const categoryMap = new Map(
    (categories ?? []).map((c: { id: string; slug: string; taxonomy_type: string }) => [
      c.id,
      { slug: c.slug, taxonomy_type: c.taxonomy_type },
    ]),
  );

  // Score and rank products
  type ScoredProduct = (typeof products)[number] & { relevance: number };
  const scored: ScoredProduct[] = products.map((p) => {
    let relevance = (p.score ?? 5) * 10;

    // Category match scoring
    const cat = p.category_id ? categoryMap.get(p.category_id) : undefined;
    if (cat) {
      if (cat.taxonomy_type === "occasion" && cat.slug === occasion) relevance += 15;
      if (cat.taxonomy_type === "recipient" && cat.slug === recipient) relevance += 20;
      if (cat.slug === style) relevance += 15;
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

  const results = scored.slice(0, 3).map((p) => ({
    name: p.name,
    slug: p.slug,
    price: p.price,
    price_amount: p.price_amount,
    price_currency: p.price_currency,
    score: p.score,
    affiliate_url: p.affiliate_url,
    image_url: p.image_url,
    description: p.description,
    merchant: p.merchant,
    deal_text: p.deal_text,
  }));

  return NextResponse.json({ results });
}
