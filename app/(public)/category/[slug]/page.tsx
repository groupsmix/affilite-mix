import { getCurrentSite } from "@/lib/site-context";
import { getCategoryBySlug, listCategories } from "@/lib/dal/categories";
import { listContent } from "@/lib/dal/content";
import { listActiveProducts } from "@/lib/dal/products";
import { ContentCard } from "../../components/content-card";
import { ProductCard } from "../../components/product-card";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
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

  return {
    title: `${category.name} — ${site.name}`,
    description: category.description || `Browse ${category.name} on ${site.name}`,
    alternates: {
      canonical: `/category/${category.slug}`,
    },
  };
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;
  const site = await getCurrentSite();
  const category = await getCategoryBySlug(site.id, slug);

  if (!category) {
    notFound();
  }

  const [content, products] = await Promise.all([
    listContent({
      siteId: site.id,
      categoryId: category.id,
      status: "published",
      limit: 20,
    }),
    listActiveProducts(site.id, slug),
  ]);

  const locale = site.language === "ar" ? "ar-SA" : "en-US";
  const ctaLabel = site.language === "ar" ? "احصل على العرض" : "View Deal";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">{category.name}</h1>
        {category.description && (
          <p className="text-gray-600">{category.description}</p>
        )}
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
