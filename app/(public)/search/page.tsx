import { Suspense } from "react";
import { headers } from "next/headers";
import { getCurrentSite } from "@/lib/site-context";
import { searchContent } from "@/lib/dal/content";
import { searchProducts } from "@/lib/dal/products";
import { checkRateLimit } from "@/lib/rate-limit";
import { ContentCard } from "../components/content-card";
import { ProductCard } from "../components/product-card";
import { Breadcrumbs } from "../components/breadcrumbs";
import { SearchInput } from "./search-input";
import type { Metadata } from "next";

/** Rate limit: 30 searches per minute per IP */
const SEARCH_RATE_LIMIT = { maxRequests: 30, windowMs: 60_000 };

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const { q } = await searchParams;
  const site = await getCurrentSite();
  const title = q ? `Search: ${q} — ${site.name}` : `Search — ${site.name}`;
  return { title, robots: { index: false } };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams;
  const site = await getCurrentSite();
  const query = (q ?? "").trim();

  const locale = site.language === "ar" ? "ar-SA" : "en-US";
  const ctaLabel = site.language === "ar" ? "احصل على العرض" : "View Deal";

  let contentResults: Awaited<ReturnType<typeof searchContent>> = [];
  let productResults: Awaited<ReturnType<typeof searchProducts>> = [];
  let rateLimited = false;

  if (query.length >= 2) {
    // Rate limit search queries to prevent abuse
    const headerList = await headers();
    const ip =
      headerList.get("cf-connecting-ip") ??
      headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const rl = await checkRateLimit(`search:${ip}`, SEARCH_RATE_LIMIT);

    if (!rl.allowed) {
      rateLimited = true;
    } else {
      [contentResults, productResults] = await Promise.all([
        searchContent(site.id, query, 12),
        searchProducts(site.id, query, 12),
      ]);
    }
  }

  const hasResults = contentResults.length > 0 || productResults.length > 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumbs
        items={[
          { label: site.name, href: "/" },
          { label: site.language === "ar" ? "بحث" : "Search" },
        ]}
      />

      <header className="mb-8">
        <h1 className="mb-4 text-3xl font-bold">{site.language === "ar" ? "بحث" : "Search"}</h1>
        <Suspense>
          <SearchInput
            placeholder={
              site.language === "ar"
                ? "ابحث عن منتجات أو مقالات..."
                : "Search products or articles..."
            }
            buttonLabel={site.language === "ar" ? "بحث" : "Search"}
          />
        </Suspense>
      </header>

      {/* Rate limit message */}
      {rateLimited && (
        <div className="py-16 text-center text-gray-500">
          <p className="text-lg">
            {site.language === "ar"
              ? "أنت تبحث بسرعة كبيرة. يرجى الانتظار قليلاً والمحاولة مرة أخرى."
              : "You're searching too quickly. Please wait a moment and try again."}
          </p>
        </div>
      )}

      {/* Screen reader announcement for search results */}
      {query.length >= 2 && !rateLimited && (
        <div className="sr-only" role="status" aria-live="polite">
          {hasResults
            ? site.language === "ar"
              ? `تم العثور على ${productResults.length} منتجات و ${contentResults.length} محتوى`
              : `Found ${productResults.length} products and ${contentResults.length} articles`
            : site.language === "ar"
              ? `لا توجد نتائج لـ "${query}"`
              : `No results found for "${query}"`}
        </div>
      )}

      {query.length >= 2 && !hasResults && (
        <div className="py-16 text-center text-gray-500">
          <p className="text-lg">
            {site.language === "ar"
              ? `لا توجد نتائج لـ "${query}"`
              : `No results found for "${query}"`}
          </p>
        </div>
      )}

      {query.length > 0 && query.length < 2 && (
        <div className="py-16 text-center text-gray-500">
          <p className="text-lg">
            {site.language === "ar"
              ? "يرجى إدخال حرفين على الأقل"
              : "Please enter at least 2 characters"}
          </p>
        </div>
      )}

      {productResults.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 text-xl font-bold">
            {site.language === "ar" ? site.productLabelPlural : "Products"}
            <span className="ms-2 text-sm font-normal text-gray-500">
              ({productResults.length})
            </span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {productResults.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                sourceType="search"
                ctaLabel={ctaLabel}
                searchQuery={query}
              />
            ))}
          </div>
        </section>
      )}

      {contentResults.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 text-xl font-bold">
            {site.language === "ar" ? "محتوى" : "Content"}
            <span className="ms-2 text-sm font-normal text-gray-500">
              ({contentResults.length})
            </span>
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {contentResults.map((item) => (
              <ContentCard key={item.id} content={item} locale={locale} searchQuery={query} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
