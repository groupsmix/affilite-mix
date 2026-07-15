import { getCurrentSite } from "@/lib/site-context";
import { getCategoryBySlug } from "@/lib/dal/categories";
import { listContent, countContent } from "@/lib/dal/content";
import { listProducts } from "@/lib/dal/products";
import { getTenantClient } from "@/lib/supabase-server";
import { ContentCardGrid } from "./content-card-grid";
import { ProductCard } from "./product-card";
import { Pagination, PaginationHead } from "./pagination";
import { Breadcrumbs } from "./breadcrumbs";
import { JsonLd, breadcrumbJsonLd } from "./json-ld";
import { NewsletterSignup } from "./newsletter-signup";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

const PAGE_SIZE = 12;

export interface TaxonomyConfig {
  /** URL prefix, e.g. "budget", "occasion", "recipient", "brands" */
  prefix: string;
  /** Human-readable label for breadcrumbs, e.g. "Shop by Budget" */
  label: string;
  /**
   * The site feature flag that gates this taxonomy family. The route returns
   * 404 on any tenant that does not enable it, so off-niche taxonomy (e.g. the
   * watch gift taxonomy) never renders or gets indexed on sites like
   * compareai.site that have no business exposing it.
   */
  feature: "taxonomyPages" | "brandSpotlights";
}

interface TaxonomyPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateTaxonomyMetadata(
  config: TaxonomyConfig,
  { params }: Pick<TaxonomyPageProps, "params">,
): Promise<Metadata> {
  const { slug } = await params;
  const site = await getCurrentSite();

  // Tenant gate: emit no metadata for sites that don't enable this taxonomy
  // family. Returning {} avoids leaking a canonical/title for a 404 page.
  if (!site.features[config.feature]) {
    return {};
  }

  const category = await getCategoryBySlug(site.id, slug);

  if (!category) {
    return { title: "Not Found" };
  }

  const url = `https://${site.domain}/${config.prefix}/${category.slug}`;
  const description = `Browse ${category.name} — ${config.label} on ${site.name}`;

  return {
    title: category.name,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: category.name,
      description,
      url,
      siteName: site.name,
      locale: site.locale,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: category.name,
      description,
    },
  };
}

export async function TaxonomyPage({
  config,
  params,
  searchParams,
}: {
  config: TaxonomyConfig;
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const currentPage = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const site = await getCurrentSite();

  // Tenant gate: this taxonomy family only exists on sites that enable the
  // controlling feature flag (e.g. the watch gift taxonomy on wristnerd.xyz).
  if (!site.features[config.feature]) {
    notFound();
  }

  const category = await getCategoryBySlug(site.id, slug);

  if (!category) {
    notFound();
  }

  const [content, totalContent, products] = await Promise.all([
    listContent(
      {
        siteId: site.id,
        categoryId: category.id,
        status: "published",
        limit: PAGE_SIZE,
        offset: (currentPage - 1) * PAGE_SIZE,
      },
      getTenantClient,
    ),
    countContent(
      {
        siteId: site.id,
        categoryId: category.id,
        status: "published",
      },
      getTenantClient,
    ),
    listProducts(
      {
        siteId: site.id,
        categoryId: category.id,
        status: "active",
        sortBy: "score",
        sortDirection: "desc",
        limit: 24,
      },
      getTenantClient,
    ),
  ]);

  const locale = site.language === "ar" ? "ar-SA" : "en-US";
  const ctaLabel = site.language === "ar" ? "احصل على العرض" : "View Deal";

  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: config.label, path: "/" },
    { name: category.name, path: `/${config.prefix}/${category.slug}` },
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <JsonLd data={breadcrumbs} />

      <Breadcrumbs
        items={[
          { label: site.name, href: "/" },
          { label: config.label, href: "/" },
          { label: category.name },
        ]}
      />

      <header className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">{category.name}</h1>
        {category.description && <p className="text-gray-600">{category.description}</p>}
      </header>

      {/* Products */}
      {products.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 text-xl font-bold">{site.productLabelPlural}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                sourceType={config.prefix}
                ctaLabel={ctaLabel}
              />
            ))}
          </div>
        </section>
      )}

      {/* Content */}
      {content.length > 0 ? (
        <ContentCardGrid items={content} locale={locale} />
      ) : products.length === 0 ? (
        <div className="py-16 text-center text-gray-500">
          <p className="text-lg">
            {site.language === "ar"
              ? "لا يوجد محتوى في هذا التصنيف بعد"
              : "No content in this category yet"}
          </p>
        </div>
      ) : null}

      <PaginationHead
        currentPage={currentPage}
        totalItems={totalContent}
        pageSize={PAGE_SIZE}
        baseUrl={`https://${site.domain}/${config.prefix}/${category.slug}`}
      />
      <Pagination
        currentPage={currentPage}
        totalItems={totalContent}
        pageSize={PAGE_SIZE}
        basePath={`/${config.prefix}/${category.slug}`}
      />

      {/* Newsletter */}
      <section className="mt-12">
        <NewsletterSignup siteLanguage={site.language} />
      </section>
    </div>
  );
}
