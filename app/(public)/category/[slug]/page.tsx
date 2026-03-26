import { getCurrentSite } from "@/lib/site-context";
import { getCategoryBySlug, listCategories } from "@/lib/dal/categories";
import { listContent } from "@/lib/dal/content";
import { ContentCard } from "../../components/content-card";
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
    return { title: "غير موجود" };
  }

  return {
    title: `${category.name} — ${site.name}`,
    description: category.description || `تصفح محتوى ${category.name}`,
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

  const content = await listContent({
    siteId: site.id,
    categoryId: category.id,
    status: "published",
    limit: 20,
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">{category.name}</h1>
        {category.description && (
          <p className="text-gray-600">{category.description}</p>
        )}
      </header>

      {content.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {content.map((item) => (
            <ContentCard key={item.id} content={item} />
          ))}
        </div>
      ) : (
        <div className="py-16 text-center text-gray-400">
          <p className="text-lg">لا يوجد محتوى في هذا التصنيف بعد</p>
        </div>
      )}
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
