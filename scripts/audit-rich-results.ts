/**
 * Rich Results schema.org audit script.
 *
 * Validates JSON-LD output from the json-ld.tsx helpers against
 * Google's Rich Results requirements for Product, Review, Article,
 * FAQ, BreadcrumbList, Organization, and WebSite types.
 *
 * Run: npx tsx scripts/audit-rich-results.ts
 */

import {
  organizationJsonLd,
  webSiteJsonLd,
  breadcrumbJsonLd,
  articleJsonLd,
  reviewJsonLd,
  faqJsonLd,
  productJsonLd,
} from "../app/(public)/components/json-ld";
import type { SiteDefinition } from "../config/site-definition";
import type { ContentRow, ProductRow } from "../types/database";

// ── Test fixtures ──────────────────────────────────────────────────────

const mockSite = {
  id: "watch-tools",
  name: "WristNerd",
  domain: "wristnerd.xyz",
  aliases: [],
  language: "en",
  direction: "ltr",
  locale: "en-US",
  brand: {
    description: "Expert watch reviews and buying guides",
    contactEmail: "hello@wristnerd.xyz",
    niche: "watches",
  },
  theme: {
    primaryColor: "#1a1a1a",
    accentColor: "#c89b3c",
    accentTextColor: "#8a6d2b",
    fontHeading: "Inter",
    fontBody: "Inter",
  },
  nav: [],
  footerNav: {},
  contentTypes: [],
  productLabel: "Watch",
  productLabelPlural: "Watches",
  affiliateDisclosure: "We may earn commissions.",
  contentDisclosure: "Content is independently created.",
  monetizationType: "affiliate",
  features: {},
  pages: {
    about: { title: "About", description: "About us" },
    privacy: { title: "Privacy", description: "Privacy policy" },
    terms: { title: "Terms", description: "Terms of service" },
  },
  seo: { robotsDisallow: [], sitemapStaticPages: [] },
} as any as SiteDefinition;

const mockContent: ContentRow = {
  id: "content-1",
  site_id: "site-1",
  title: "Rolex Submariner Review 2024",
  slug: "rolex-submariner-review",
  body: "<h2>Is the Submariner worth it?</h2><p>Yes, if you value build quality.</p>",
  excerpt: "Our comprehensive review of the iconic Rolex Submariner.",
  featured_image: "https://images.example.com/submariner.jpg",
  type: "review",
  status: "published",
  category_id: null,
  tags: ["rolex", "dive-watch"],
  author: "James Expert",
  publish_at: "2024-01-15T00:00:00Z",
  meta_title: null,
  meta_description: null,
  og_image: null,
  body_previous: null,
  created_at: "2024-01-10T00:00:00Z",
  updated_at: "2024-01-15T00:00:00Z",
};

const mockProduct: ProductRow = {
  id: "prod-1",
  site_id: "site-1",
  name: "Rolex Submariner Date 126610LN",
  slug: "rolex-submariner-126610ln",
  description: "The iconic dive watch with a date complication.",
  affiliate_url: "https://affiliate.example.com/submariner",
  image_url: "https://images.example.com/submariner.jpg",
  image_alt: "Rolex Submariner Date",
  price: "$9,150",
  price_amount: 9150,
  price_currency: "USD",
  merchant: "Rolex",
  score: 9.2,
  featured: true,
  status: "active",
  category_id: null,
  cta_text: "Check Price",
  deal_text: "",
  deal_expires_at: null,
  pros: "Build quality, resale value",
  cons: "Price, availability",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-15T00:00:00Z",
};

// ── Validators ──────────────────────────────────────────────────────────

interface ValidationResult {
  type: string;
  errors: string[];
  warnings: string[];
}

function validateRequired(
  data: Record<string, unknown>,
  fields: string[],
  typeName: string,
): string[] {
  const errors: string[] = [];
  for (const field of fields) {
    if (
      !(field in data) ||
      data[field] === undefined ||
      data[field] === null ||
      data[field] === ""
    ) {
      errors.push(`${typeName}: missing required field "${field}"`);
    }
  }
  return errors;
}

function validateOrganization(data: Record<string, unknown>): ValidationResult {
  return {
    type: "Organization",
    errors: validateRequired(data, ["@context", "@type", "name", "url"], "Organization"),
    warnings: !data.logo ? ["Organization: missing recommended field 'logo'"] : [],
  };
}

function validateWebSite(data: Record<string, unknown>): ValidationResult {
  return {
    type: "WebSite",
    errors: validateRequired(data, ["@context", "@type", "name", "url"], "WebSite"),
    warnings: !data.potentialAction
      ? ["WebSite: missing recommended 'potentialAction' (SearchAction) for sitelinks search box"]
      : [],
  };
}

function validateBreadcrumb(data: Record<string, unknown>): ValidationResult {
  const errors = validateRequired(data, ["@context", "@type", "itemListElement"], "BreadcrumbList");
  const items = data.itemListElement as unknown[];
  if (Array.isArray(items)) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i] as Record<string, unknown>;
      if (!item.name) errors.push(`BreadcrumbList: item ${i + 1} missing 'name'`);
      if (!item.item) errors.push(`BreadcrumbList: item ${i + 1} missing 'item' (URL)`);
    }
  }
  return { type: "BreadcrumbList", errors, warnings: [] };
}

function validateArticle(data: Record<string, unknown>): ValidationResult {
  const errors = validateRequired(
    data,
    ["@context", "@type", "headline", "datePublished", "author"],
    "Article",
  );
  const warnings: string[] = [];
  if (!data.image) warnings.push("Article: missing recommended field 'image'");
  if (!data.dateModified) warnings.push("Article: missing recommended field 'dateModified'");
  const headline = data.headline as string;
  if (headline && headline.length > 110) {
    warnings.push(`Article: headline exceeds 110 chars (${headline.length})`);
  }
  return { type: "Article", errors, warnings };
}

function validateReview(data: Record<string, unknown>): ValidationResult {
  const errors = validateRequired(data, ["@context", "@type", "author", "itemReviewed"], "Review");
  const warnings: string[] = [];
  if (!data.reviewRating) warnings.push("Review: missing recommended field 'reviewRating'");
  if (!data.reviewBody && !data.description) {
    warnings.push("Review: missing recommended 'reviewBody' or 'description'");
  }
  return { type: "Review", errors, warnings };
}

function validateProduct(data: Record<string, unknown>): ValidationResult {
  const errors = validateRequired(data, ["@context", "@type", "name"], "Product");
  const warnings: string[] = [];
  if (!data.image) warnings.push("Product: missing recommended field 'image'");
  if (!data.offers)
    warnings.push("Product: missing recommended field 'offers' (for rich snippets)");
  if (data.offers) {
    const offers = data.offers as Record<string, unknown>;
    if (!offers.price) errors.push("Product.offers: missing required field 'price'");
    if (!offers.priceCurrency)
      errors.push("Product.offers: missing required field 'priceCurrency'");
  }
  if (!data.brand) warnings.push("Product: missing recommended field 'brand'");
  return { type: "Product", errors, warnings };
}

function validateFaq(data: Record<string, unknown>): ValidationResult {
  const errors = validateRequired(data, ["@context", "@type", "mainEntity"], "FAQPage");
  const items = data.mainEntity as unknown[];
  if (Array.isArray(items)) {
    for (let i = 0; i < items.length; i++) {
      const q = items[i] as Record<string, unknown>;
      if (!q.name) errors.push(`FAQPage: question ${i + 1} missing 'name'`);
      const answer = q.acceptedAnswer as Record<string, unknown>;
      if (!answer?.text) errors.push(`FAQPage: question ${i + 1} missing 'acceptedAnswer.text'`);
    }
  }
  return { type: "FAQPage", errors, warnings: [] };
}

// ── Run audit ───────────────────────────────────────────────────────────

function runAudit() {
  console.log("🔍 Rich Results Schema Audit\n");
  console.log("=".repeat(60));

  const results: ValidationResult[] = [];

  // Organization
  results.push(validateOrganization(organizationJsonLd(mockSite)));

  // WebSite
  results.push(validateWebSite(webSiteJsonLd(mockSite)));

  // BreadcrumbList
  results.push(
    validateBreadcrumb(
      breadcrumbJsonLd(mockSite, [
        { name: "Home", path: "/" },
        { name: "Reviews", path: "/review" },
        { name: "Rolex Submariner", path: "/review/rolex-submariner-review" },
      ]),
    ),
  );

  // Article
  results.push(validateArticle(articleJsonLd(mockSite, mockContent)));

  // Review (with product)
  results.push(validateReview(reviewJsonLd(mockSite, mockContent, mockProduct)));

  // Review (without product)
  results.push(validateReview(reviewJsonLd(mockSite, mockContent)));

  // Product
  results.push(validateProduct(productJsonLd(mockSite, mockProduct)));

  // FAQ
  const faqData = faqJsonLd(mockContent.body);
  if (faqData) {
    results.push(validateFaq(faqData));
  } else {
    console.log("\n⚠️  FAQ: No FAQ pairs extracted from test content");
  }

  // Product without price
  const noPrice = { ...mockProduct, price: "", price_amount: null };
  results.push(validateProduct(productJsonLd(mockSite, noPrice)));

  // ── Report ──────────────────────────────────────────────────────────

  let totalErrors = 0;
  let totalWarnings = 0;

  for (const result of results) {
    console.log(`\n📋 ${result.type}`);
    if (result.errors.length === 0 && result.warnings.length === 0) {
      console.log("   ✓ All checks passed");
    }
    for (const err of result.errors) {
      console.log(`   ❌ ${err}`);
      totalErrors++;
    }
    for (const warn of result.warnings) {
      console.log(`   ⚠️  ${warn}`);
      totalWarnings++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`\n📊 Summary: ${totalErrors} error(s), ${totalWarnings} warning(s)`);

  if (totalErrors > 0) {
    console.log("\n❌ Rich Results audit FAILED — fix errors above before deploying.");
    process.exit(1);
  } else {
    console.log("\n✓ Rich Results audit passed (warnings are recommendations).");
  }
}

runAudit();
