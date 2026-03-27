import { getCurrentSite } from "@/lib/site-context";
import { getCategoryBySlug, listCategories } from "@/lib/dal/categories";
import { listContent, countContent } from "@/lib/dal/content";
import { listActiveProducts } from "@/lib/dal/products";
import { ContentCard } from "../../components/content-card";
import { ProductCard } from "../../components/product-card";
import { Pagination } from "../../components/pagination";
import { JsonLd, breadcrumbJsonLd } from "../../components/json-ld";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

const PAGE_SIZE = 12;

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const site = await getCurrentSite();
  const category = await getCategoryBySlug(site.id, slug);

  if (!category) {
    return { title: "Not Found" };
  }

  const url = `https://${site.domain}/category/${category.slug}`;
  const description = `Browse ${category.name} on ${site.name}`;

  return {
    title: `${category.name} — ${site.name}`,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: `${category.name} — ${site.name}`,
      description,
      url,
      siteName: site.name,
      locale: site.locale,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: `${category.name} — ${site.name}`,
      description,
    },
  };
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const currentPage = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const site = await getCurrentSite();
  const category = await getCategoryBySlug(site.id, slug);

  if (!category) {
    notFound();
  }

  const [content, totalContent, products] = await Promise.all([
    listContent({
      siteId: site.id,
      categoryId: category.id,
      status: "published",
      limit: PAGE_SIZE,
      offset: (currentPage - 1) * PAGE_SIZE,
    }),
    countContent({
      siteId: site.id,
      categoryId: category.id,
      status: "published",
    }),
    listActiveProducts(site.id, slug),
  ]);

  const locale = site.language === "ar" ? "ar-SA" : "en-US";
  const ctaLabel = site.language === "ar" ? "احصل على العرض" : "View Deal";

  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: category.name, path: `/category/${category.slug}` },
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <JsonLd data={breadcrumbs} />
      <header className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">{category.name}</h1>
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
                sourceType="category"
                ctaLabel={ctaLabel}
              />
            ))}
          </div>
        </section>
      )}

      {/* Content */}
      {content.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {content.map((item) => (
            <ContentCard key={item.id} content={item} locale={locale} />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="py-16 text-center text-gray-400">
          <p className="text-lg">
            {site.language === "ar"
              ? "لا يوجد محتوى في هذا التصنيف بعد"
              : "No content in this category yet"}
          </p>
        </div>
      ) : null}

      <Pagination
        currentPage={currentPage}
        totalItems={totalContent}
        pageSize={PAGE_SIZE}
        basePath={`/category/${category.slug}`}
      />
    </div>
  );
}

/** Pre-generate category pages at build time if categories exist */
export async function generateStaticParams() {
  try {
    const site = await getCurrentSite();
    const categories = await listCategories(site.id);
    return categories.map((c) => ({ slug: c.slug }));
  } catch {
    return [];
  }
}
