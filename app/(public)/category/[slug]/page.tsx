import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentSite } from "@/lib/site-context";
import { getCategoryBySlug } from "@/lib/dal/categories";
import { listActiveProducts } from "@/lib/dal/products";
import { listPublishedContent } from "@/lib/dal/content";
import { ProductCard } from "../../components/product-card";
import { ContentCard } from "../../components/content-card";

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const site = await getCurrentSite();
  const { slug } = await params;
  const category = await getCategoryBySlug(site.id, slug);

  if (!category) return { title: "Category Not Found" };

  return {
    title: `${category.name} — ${site.name}`,
    description: category.description || `Browse ${category.name} on ${site.name}`,
    alternates: { canonical: `https://${site.domain}/category/${slug}` },
  };
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const site = await getCurrentSite();
  const { slug } = await params;
  const category = await getCategoryBySlug(site.id, slug);

  if (!category) notFound();

  const [products, contentItems] = await Promise.all([
    listActiveProducts(site.id, slug),
    listPublishedContent(site.id),
  ]);

  // Filter content by category
  const categoryContent = contentItems.filter(
    (c) => c.category_id === category.id,
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">{category.name}</h1>
        {category.description && (
          <p className="mt-2 text-lg text-gray-600">{category.description}</p>
        )}
      </div>

      {/* Products in this category */}
      {products.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 text-xl font-bold text-gray-900">
            {site.productLabelPlural}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} siteId={site.id} />
            ))}
          </div>
        </section>
      )}

      {/* Content in this category */}
      {categoryContent.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 text-xl font-bold text-gray-900">Articles</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categoryContent.map((item) => (
              <ContentCard key={item.id} content={item} />
            ))}
          </div>
        </section>
      )}

      {products.length === 0 && categoryContent.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">No content in this category yet.</p>
        </div>
      )}
    </div>
  );
}
