import { getCurrentSite } from "@/lib/site-context";
import { searchContent } from "@/lib/dal/content";
import { searchProducts } from "@/lib/dal/products";
import { ContentCard } from "../components/content-card";
import { ProductCard } from "../components/product-card";
import { Breadcrumbs } from "../components/breadcrumbs";
import type { Metadata } from "next";

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

  if (query.length >= 2) {
    [contentResults, productResults] = await Promise.all([
      searchContent(site.id, query, 12),
      searchProducts(site.id, query, 12),
    ]);
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
        <h1 className="mb-4 text-3xl font-bold">
          {site.language === "ar" ? "بحث" : "Search"}
        </h1>
        <form action="/search" method="GET">
          <div className="flex gap-2">
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder={site.language === "ar" ? "ابحث عن منتجات أو مقالات..." : "Search products or articles..."}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              autoFocus
            />
            <button
              type="submit"
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
            >
              {site.language === "ar" ? "بحث" : "Search"}
            </button>
          </div>
        </form>
      </header>

      {query.length >= 2 && !hasResults && (
        <div className="py-16 text-center text-gray-400">
          <p className="text-lg">
            {site.language === "ar"
              ? `لا توجد نتائج لـ "${query}"`
              : `No results found for "${query}"`}
          </p>
        </div>
      )}

      {query.length > 0 && query.length < 2 && (
        <div className="py-16 text-center text-gray-400">
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
            <span className="ml-2 text-sm font-normal text-gray-400">({productResults.length})</span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {productResults.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                sourceType="search"
                ctaLabel={ctaLabel}
              />
            ))}
          </div>
        </section>
      )}

      {contentResults.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 text-xl font-bold">
            {site.language === "ar" ? "محتوى" : "Content"}
            <span className="ml-2 text-sm font-normal text-gray-400">({contentResults.length})</span>
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {contentResults.map((item) => (
              <ContentCard key={item.id} content={item} locale={locale} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
