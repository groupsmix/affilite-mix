import { getCurrentSite } from "@/lib/site-context";
import { getCategoryBySlug } from "@/lib/dal/categories";
import { listContent, countContent } from "@/lib/dal/content";
import { listActiveProducts } from "@/lib/dal/products";
import { getTenantClient } from "@/lib/supabase-server";
import { ContentCardGrid } from "../../components/content-card-grid";
import { ProductCard } from "../../components/product-card";
import { Pagination, PaginationHead } from "../../components/pagination";
import { Breadcrumbs } from "../../components/breadcrumbs";
import { JsonLd, breadcrumbJsonLd } from "../../components/json-ld";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CalmShell } from "../../components/calmroutine/shell";
import { CalmCategoryPage as CalmCategoryView } from "../../components/calmroutine/category-view";
import { calmCategories, type CalmCategorySlug } from "@/lib/calmroutine";

/** Revalidate category pages every 60 seconds (ISR) */
export const revalidate = 60;

const PAGE_SIZE = 12;

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const site = await getCurrentSite();

  if (site.id === "calm-routine") {
    const cat = calmCategories[slug as CalmCategorySlug];
    if (!cat) {
      return { title: "Not Found" };
    }
    const url = `https://${site.domain}/category/${cat.slug}`;
    const description = `Browse ${cat.name} on ${site.name}`;
    return {
      title: cat.name,
      description,
      alternates: { canonical: url },
      openGraph: {
        title: cat.name,
        description,
        url,
        siteName: site.name,
        locale: site.locale,
        type: "website",
      },
      twitter: { card: "summary", title: cat.name, description },
    };
  }

  const category = await getCategoryBySlug(site.id, slug);

  if (!category) {
    return { title: "Not Found" };
  }

  const url = `https://${site.domain}/category/${category.slug}`;
  const description = `Browse ${category.name} on ${site.name}`;

  return {
    title: category.name,
    description,
    alternates: {
      canonical: url,
    },
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

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const currentPage = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const site = await getCurrentSite();

  if (site.id === "calm-routine") {
    if (!calmCategories[slug as CalmCategorySlug]) {
      notFound();
    }
    return (
      <CalmShell site={site}>
        <div className="mx-auto max-w-5xl px-6 py-10">
          <CalmCategoryView category={slug as CalmCategorySlug} />
        </div>
      </CalmShell>
    );
  }

  const category = await getCategoryBySlug(site.id, slug);

  if (!category) {
    notFound();
  }

  // Public reads go through the anon client (published/active rows are
  // anon-readable). The tenant client mints an HS256 JWT that the rotated
  // Supabase signing keys reject, so the tenant path errors on public pages.
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
    listActiveProducts(site.id, slug),
  ]);

  const locale = site.language === "ar" ? "ar-SA" : "en-US";
  const ctaLabel = site.language === "ar" ? "احصل على العرض" : "View Deal";

  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: category.name, path: `/category/${category.slug}` },
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <JsonLd data={breadcrumbs} />

      <Breadcrumbs items={[{ label: site.name, href: "/" }, { label: category.name }]} />

      <header className="mb-10">
        <h1 className="max-w-3xl text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
          {category.name}
        </h1>
        {category.description && (
          <p className="mt-3 max-w-3xl text-lg leading-relaxed text-gray-600">
            {category.description}
          </p>
        )}
      </header>

      {/* Products */}
      {products.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-5 text-xl font-extrabold tracking-tight text-gray-900">
            {site.productLabelPlural}
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                sourceType="category"
                ctaLabel={ctaLabel}
              />
            ))}
          </div>
        </section>
      )}

      {/* Content */}
      {content.length > 0 ? (
        <section>
          <h2 className="mb-5 text-xl font-extrabold tracking-tight text-gray-900">
            {site.language === "ar" ? "قراءات ذات صلة" : "Related reading"}
          </h2>
          <ContentCardGrid items={content} locale={locale} />
        </section>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-gray-50 py-16 text-center text-gray-500">
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
        baseUrl={`https://${site.domain}/category/${category.slug}`}
      />
      <Pagination
        currentPage={currentPage}
        totalItems={totalContent}
        pageSize={PAGE_SIZE}
        basePath={`/category/${category.slug}`}
      />
    </main>
  );
}
