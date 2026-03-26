import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentSite } from "@/lib/site-context";
import { getContentBySlug } from "@/lib/dal/content";
import { getLinkedProducts } from "@/lib/dal/content-products";
import { ProductCard } from "../../components/product-card";

interface ContentPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ContentPageProps): Promise<Metadata> {
  const site = await getCurrentSite();
  const { slug } = await params;
  const content = await getContentBySlug(site.id, slug);

  if (!content) return { title: "Content Not Found" };

  return {
    title: `${content.title} — ${site.name}`,
    description: content.excerpt || content.title,
    alternates: { canonical: `https://${site.domain}/content/${slug}` },
  };
}

export default async function ContentPage({ params }: ContentPageProps) {
  const site = await getCurrentSite();
  const { slug } = await params;
  const content = await getContentBySlug(site.id, slug);

  if (!content) notFound();

  const linkedProducts = await getLinkedProducts(content.id);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      {/* Article header */}
      <header className="mb-8">
        <div className="mb-3 flex items-center gap-2 text-sm text-gray-400">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600">
            {content.type}
          </span>
          {content.updated_at && (
            <time dateTime={content.updated_at}>
              {new Date(content.updated_at).toLocaleDateString(site.language === "ar" ? "ar-SA" : "en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </time>
          )}
          {content.author && <span>by {content.author}</span>}
        </div>

        <h1 className="text-3xl font-bold text-gray-900">{content.title}</h1>

        {content.excerpt && (
          <p className="mt-3 text-lg text-gray-600">{content.excerpt}</p>
        )}
      </header>

      {/* Content disclosure */}
      <div className="mb-6 rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
        {site.contentDisclosure}
      </div>

      {/* Article body */}
      <article className="prose prose-gray max-w-none">
        <div dangerouslySetInnerHTML={{ __html: content.body }} />
      </article>

      {/* Tags */}
      {content.tags.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-2">
          {content.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Linked Products */}
      {linkedProducts.length > 0 && (
        <section className="mt-10 border-t border-gray-200 pt-8">
          <h2 className="mb-4 text-xl font-bold text-gray-900">
            Related {site.productLabelPlural}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {linkedProducts.map((lp) => (
              <ProductCard
                key={lp.product_id}
                product={lp.product}
                sourceType="linked"
                ctaLabel={site.language === "ar" ? "احصل على العرض" : "View Deal"}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
