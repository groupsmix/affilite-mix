#!/usr/bin/env tsx
/**
 * Database seed script — populates all three sites with sample data.
 *
 * Usage:
 *   npm run seed
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL env vars.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

interface SiteSeed {
  slug: string;
  name: string;
  domain: string;
  language: string;
  direction: "ltr" | "rtl";
}

const sites: SiteSeed[] = [
  { slug: "watch-tools", name: "Watch Tools", domain: "watchtoolshub.com", language: "en", direction: "ltr" },
  { slug: "crypto-tools", name: "Crypto Tools", domain: "cryptotoolshub.com", language: "en", direction: "ltr" },
  { slug: "arabic-tools", name: "Arabic Tools", domain: "arabictoolshub.com", language: "ar", direction: "rtl" },
];

async function upsertSites(): Promise<Map<string, string>> {
  const siteIds = new Map<string, string>();

  for (const site of sites) {
    const { data: existing } = await sb
      .from("sites")
      .select("id")
      .eq("slug", site.slug)
      .single();

    if (existing) {
      siteIds.set(site.slug, existing.id);
      console.log(`  Site "${site.slug}" already exists (${existing.id})`);
      continue;
    }

    const { data, error } = await sb
      .from("sites")
      .insert({
        slug: site.slug,
        name: site.name,
        domain: site.domain,
        language: site.language,
        direction: site.direction,
        is_active: true,
      })
      .select("id")
      .single();

    if (error) {
      console.error(`  Failed to create site "${site.slug}":`, error.message);
      continue;
    }
    siteIds.set(site.slug, data.id);
    console.log(`  Created site "${site.slug}" (${data.id})`);
  }

  return siteIds;
}

async function seedCategories(siteIds: Map<string, string>) {
  const categories = [
    { name: "Luxury Watches", slug: "luxury-watches", description: "Premium timepieces", taxonomy_type: "general" as const },
    { name: "Under $200", slug: "under-200", description: "Affordable watches", taxonomy_type: "budget" as const },
    { name: "Gift Ideas", slug: "gift-ideas", description: "Perfect for gifting", taxonomy_type: "occasion" as const },
  ];

  for (const [slug, siteId] of siteIds) {
    for (const cat of categories) {
      const { data: existing } = await sb
        .from("categories")
        .select("id")
        .eq("site_id", siteId)
        .eq("slug", cat.slug)
        .single();

      if (existing) continue;

      const { error } = await sb.from("categories").insert({
        site_id: siteId,
        ...cat,
      });

      if (error) {
        console.error(`  Failed to seed category "${cat.slug}" for ${slug}:`, error.message);
      }
    }
    console.log(`  Seeded categories for "${slug}"`);
  }
}

async function seedProducts(siteIds: Map<string, string>) {
  const products = [
    {
      name: "Classic Chronograph",
      slug: "classic-chronograph",
      description: "A timeless chronograph watch with sapphire crystal.",
      affiliate_url: "https://example.com/classic-chronograph",
      image_url: "",
      image_alt: "Classic Chronograph watch",
      price: "$249",
      price_amount: 249,
      price_currency: "USD",
      merchant: "WatchStore",
      score: 85,
      featured: true,
      status: "active" as const,
      cta_text: "Check Price",
      deal_text: "",
      pros: "Sapphire crystal, Water resistant",
      cons: "No automatic movement",
    },
    {
      name: "Diver Pro 300",
      slug: "diver-pro-300",
      description: "Professional dive watch rated to 300m.",
      affiliate_url: "https://example.com/diver-pro-300",
      image_url: "",
      image_alt: "Diver Pro 300 watch",
      price: "$399",
      price_amount: 399,
      price_currency: "USD",
      merchant: "DiveGear",
      score: 92,
      featured: true,
      status: "active" as const,
      cta_text: "View Deal",
      deal_text: "15% off this week",
      pros: "300m water resistance, Luminous dial",
      cons: "Heavy on smaller wrists",
    },
    {
      name: "Minimalist Quartz",
      slug: "minimalist-quartz",
      description: "Clean, minimal design for everyday wear.",
      affiliate_url: "https://example.com/minimalist-quartz",
      image_url: "",
      image_alt: "Minimalist Quartz watch",
      price: "$89",
      price_amount: 89,
      price_currency: "USD",
      merchant: "TimePieces",
      score: 78,
      featured: false,
      status: "active" as const,
      cta_text: "Get This Deal",
      deal_text: "",
      pros: "Affordable, Lightweight",
      cons: "No sapphire crystal",
    },
  ];

  for (const [slug, siteId] of siteIds) {
    for (const prod of products) {
      const { data: existing } = await sb
        .from("products")
        .select("id")
        .eq("site_id", siteId)
        .eq("slug", prod.slug)
        .single();

      if (existing) continue;

      const { error } = await sb.from("products").insert({
        site_id: siteId,
        ...prod,
      });

      if (error) {
        console.error(`  Failed to seed product "${prod.slug}" for ${slug}:`, error.message);
      }
    }
    console.log(`  Seeded products for "${slug}"`);
  }
}

async function seedContent(siteIds: Map<string, string>) {
  const articles = [
    {
      title: "Top 5 Watches Under $300 in 2025",
      slug: "top-watches-under-300",
      body: "<p>Looking for the best watches under $300? Here are our top picks...</p>",
      excerpt: "Our curated list of the best affordable watches.",
      featured_image: "",
      type: "guide" as const,
      status: "published" as const,
      tags: ["budget", "guide"],
      author: "Editorial Team",
    },
    {
      title: "Chronograph vs Dive Watch: Which Is Right for You?",
      slug: "chronograph-vs-dive-watch",
      body: "<p>Two of the most popular watch types compared side by side...</p>",
      excerpt: "A detailed comparison of chronograph and dive watches.",
      featured_image: "",
      type: "comparison" as const,
      status: "published" as const,
      tags: ["comparison", "guide"],
      author: "Editorial Team",
    },
  ];

  for (const [slug, siteId] of siteIds) {
    for (const article of articles) {
      const { data: existing } = await sb
        .from("content")
        .select("id")
        .eq("site_id", siteId)
        .eq("slug", article.slug)
        .single();

      if (existing) continue;

      const { error } = await sb.from("content").insert({
        site_id: siteId,
        ...article,
      });

      if (error) {
        console.error(`  Failed to seed content "${article.slug}" for ${slug}:`, error.message);
      }
    }
    console.log(`  Seeded content for "${slug}"`);
  }
}

async function main() {
  console.log("Seeding database...\n");

  console.log("1. Upserting sites...");
  const siteIds = await upsertSites();

  if (siteIds.size === 0) {
    console.error("No sites were created or found. Aborting.");
    process.exit(1);
  }

  console.log("\n2. Seeding categories...");
  await seedCategories(siteIds);

  console.log("\n3. Seeding products...");
  await seedProducts(siteIds);

  console.log("\n4. Seeding content...");
  await seedContent(siteIds);

  console.log("\nDone! Database seeded successfully.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
