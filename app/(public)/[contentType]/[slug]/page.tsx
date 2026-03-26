import { getCurrentSite } from "@/lib/site-context";
import { getContentBySlug } from "@/lib/dal/content";
import { getLinkedProducts } from "@/lib/dal/content-products";
import { HtmlRenderer } from "../../components/html-renderer";
import { ProductCard } from "../../components/product-card";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

interface ContentPageProps {
  params: Promise<{ contentType: string; slug: string }>;
}

export async function generateMetadata({
  params,
}: ContentPageProps): Promise<Metadata> {
  const { slug } = await params;
  const site = await getCurrentSite();
  const content = await getContentBySlug(site.id, slug);

  if (!content) {
    return { title: site.language === "ar" ? "غير موجود" : "Not Found" };
  }

  return {
    title: `${content.title} — ${site.name}`,
    description: content.excerpt || "",
    alternates: {
      canonical: `/${content.type}/${content.slug}`,
    },
  };
}

export default async function ContentPage({ params }: ContentPageProps) {
  const { contentType, slug } = await params;
  const site = await getCurrentSite();

  // Prevent accessing admin or api routes through this catch-all
  if (contentType === "admin" || contentType === "api" || contentType === "category") {
    notFound();
  }

  // Validate content type exists in site config
  const validContentTypes = site.contentTypes.map((ct) => ct.value);
  if (!validContentTypes.includes(contentType)) {
    notFound();
  }

  const content = await getContentBySlug(site.id, slug);

  if (!content || content.type !== contentType) {
    notFound();
  }

  // Load linked products
  const linkedProducts = await getLinkedProducts(content.id);

  return (
    <article className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <header className="mb-8">
        <div className="mb-2 text-sm text-gray-400">
          {site.contentTypes.find((ct) => ct.value === content.type)?.label}
        </div>
        <h1 className="mb-3 text-3xl font-bold leading-tight lg:text-4xl">
          {content.title}
        </h1>
        {content.excerpt && (
          <p className="text-lg text-gray-600">{content.excerpt}</p>
        )}
        {content.updated_at && (
          <time
            dateTime={content.updated_at}
            className="mt-2 block text-sm text-gray-400"
          >
            {new Date(content.updated_at).toLocaleDateString(site.language === "ar" ? "ar-SA" : "en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </time>
        )}
      </header>

      {/* Affiliate disclosure */}
      {linkedProducts.length > 0 && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {site.contentDisclosure}
        </div>
      )}

      {/* Content body */}
      <div className="mb-10">
        <HtmlRenderer html={content.body} />
      </div>

      {/* Linked products */}
      {linkedProducts.length > 0 && (
        <section className="mt-10 border-t border-gray-200 pt-8">
          <h2 className="mb-6 text-2xl font-bold">
            {site.language === "ar" ? `${site.productLabelPlural} المرتبطة` : `Related ${site.productLabelPlural}`}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {linkedProducts.map((link) => (
              <ProductCard
                key={link.product_id}
                product={link.product}
                sourceType="content"
                ctaLabel={site.language === "ar" ? "احصل على العرض" : "View Deal"}
              />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
