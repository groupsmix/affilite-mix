import { getCurrentSite } from "@/lib/site-context";
import { getContentBySlug, getRelatedContent } from "@/lib/dal/content";
import { getLinkedProducts } from "@/lib/dal/content-products";
import { injectProductLinks } from "@/lib/internal-links";
import { getAdminSession } from "@/lib/auth";
import { HtmlRenderer } from "../../components/html-renderer";
import { ProductCard } from "../../components/product-card";
import { ContentCard } from "../../components/content-card";
import { Breadcrumbs } from "../../components/breadcrumbs";
import dynamic from "next/dynamic";

const ComparisonTable = dynamic(() =>
  import("../../components/comparison-table").then((m) => m.ComparisonTable)
);
const StickyCtaBar = dynamic(() =>
  import("../../components/sticky-cta-bar").then((m) => m.StickyCtaBar)
);
const ReadingProgress = dynamic(() =>
  import("../../components/reading-progress").then((m) => m.ReadingProgress)
);
import { ProsCons } from "../../components/pros-cons";
import { GiftWorthinessScore } from "../../components/gift-worthiness-score";
import {
  JsonLd,
  articleJsonLd,
  reviewJsonLd,
  breadcrumbJsonLd,
  productJsonLd,
  faqJsonLd,
} from "../../components/json-ld";
import { notFound } from "next/navigation";
import Image from "next/image";
import type { Metadata } from "next";

/** Revalidate content detail pages every 60 seconds (ISR) */
export const revalidate = 60;

interface ContentPageProps {
  params: Promise<{ contentType: string; slug: string }>;
  searchParams: Promise<{ preview?: string }>;
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

  const url = `https://${site.domain}/${content.type}/${content.slug}`;

  const metaTitle = content.meta_title || content.title;
  const metaDesc = content.meta_description || content.excerpt || "";
  const ogImageUrl = content.og_image || content.featured_image || undefined;
  const ogImages = ogImageUrl ? [{ url: ogImageUrl }] : undefined;

  return {
    title: `${metaTitle} — ${site.name}`,
    description: metaDesc,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: `${metaTitle} — ${site.name}`,
      description: metaDesc || content.title,
      url,
      siteName: site.name,
      locale: site.locale,
      type: "article",
      publishedTime: content.created_at,
      modifiedTime: content.updated_at || undefined,
      authors: content.author ? [content.author] : undefined,
      images: ogImages,
    },
    twitter: {
      card: "summary_large_image",
      title: `${metaTitle} — ${site.name}`,
      description: metaDesc || content.title,
      images: ogImages,
    },
  };
}

export default async function ContentPage({ params, searchParams }: ContentPageProps) {
  const { contentType, slug } = await params;
  const { preview } = await searchParams;
  const site = await getCurrentSite();
  const isPreview = preview === "true";

  // Preview mode requires admin authentication
  if (isPreview) {
    const session = await getAdminSession();
    if (!session) {
      notFound();
    }
  }

  // Prevent accessing admin or api routes through this catch-all
  if (contentType === "admin" || contentType === "api" || contentType === "category") {
    notFound();
  }

  // Validate content type exists in site config
  const validContentTypes = site.contentTypes.map((ct) => ct.value);
  if (!validContentTypes.includes(contentType)) {
    notFound();
  }

  const content = await getContentBySlug(site.id, slug, isPreview);

  if (!content || content.type !== contentType) {
    notFound();
  }

  // Load linked products and related content
  const [linkedProducts, relatedContent] = await Promise.all([
    getLinkedProducts(content.id),
    getRelatedContent(site.id, content.category_id, content.id, 4),
  ]);

  // Build JSON-LD based on content type
  const contentTypeLabel = site.contentTypes.find((ct) => ct.value === content.type)?.label ?? content.type;
  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: contentTypeLabel, path: `/${content.type}` },
    { name: content.title, path: `/${content.type}/${content.slug}` },
  ]);

  const isReview = content.type === "review";
  const heroProduct = linkedProducts.find((lp) => lp.role === "hero")?.product
    ?? linkedProducts[0]?.product;

  // Separate comparison products (vs-left / vs-right)
  const vsLeft = linkedProducts.filter((lp) => lp.role === "vs-left").map((lp) => lp.product);
  const vsRight = linkedProducts.filter((lp) => lp.role === "vs-right").map((lp) => lp.product);
  const comparisonProducts = [...vsLeft, ...vsRight];
  const isComparison = content.type === "comparison" || comparisonProducts.length >= 2;

  const contentSchema = isReview
    ? reviewJsonLd(site, content, heroProduct)
    : articleJsonLd(site, content);

  // Build FAQ JSON-LD if content has FAQ-like structure
  const faqSchema = faqJsonLd(content.body);

  const locale = site.language === "ar" ? "ar-SA" : "en-US";

  return (
    <article className="mx-auto max-w-4xl px-4 py-8">
      <JsonLd data={breadcrumbs} />
      <JsonLd data={contentSchema} />
      {faqSchema && <JsonLd data={faqSchema} />}
      {linkedProducts.map((lp) => (
        <JsonLd key={lp.product_id} data={productJsonLd(site, lp.product)} />
      ))}

      <ReadingProgress />

      {/* Preview banner */}
      {isPreview && (
        <div className="mb-4 rounded-md border border-yellow-300 bg-yellow-50 px-4 py-2 text-sm font-medium text-yellow-800">
          Preview Mode — This content is not yet published.
        </div>
      )}

      {/* Breadcrumbs UI */}
      <Breadcrumbs
        items={[
          { label: site.name, href: "/" },
          { label: contentTypeLabel, href: `/${content.type}` },
          { label: content.title },
        ]}
      />

      {/* Header */}
      <header className="mb-8">
        <div className="mb-2 text-sm text-gray-400">
          {contentTypeLabel}
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
            {new Date(content.updated_at).toLocaleDateString(locale, {
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

      {/* Hero product (for reviews) */}
      {isReview && heroProduct && (
        <div className="mb-8 rounded-lg border border-gray-200 bg-gradient-to-r from-gray-50 to-white p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            {heroProduct.image_url && (
              <div className="shrink-0">
                <Image
                  src={heroProduct.image_url}
                  alt={heroProduct.name}
                  width={112}
                  height={112}
                  sizes="112px"
                  className="h-28 w-28 rounded-lg object-contain"
                />
              </div>
            )}
            <div className="flex-1">
              <h2 className="text-xl font-bold">{heroProduct.name}</h2>
              {heroProduct.merchant && (
                <p className="text-sm text-gray-500">{heroProduct.merchant}</p>
              )}
              <div className="mt-2 flex items-center gap-3">
                {heroProduct.price && (
                  <span className="text-xl font-bold" style={{ color: "var(--color-accent, #10B981)" }}>{heroProduct.price}</span>
                )}
                {heroProduct.score !== null && (
                  <GiftWorthinessScore score={heroProduct.score} size="sm" showLabel={false} />
                )}
              </div>
            </div>
            {heroProduct.affiliate_url && (
              <a
                href={`/api/track/click?p=${encodeURIComponent(heroProduct.slug)}&t=hero`}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-block rounded-lg px-6 py-3 text-center font-medium text-white transition-colors hover:opacity-90"
                style={{ backgroundColor: "var(--color-accent, #10B981)" }}
              >
                {heroProduct.cta_text || (site.language === "ar" ? "احصل على العرض" : "Get This Deal")}
              </a>
            )}
          </div>
        </div>
      )}

      {/* Comparison table */}
      {isComparison && comparisonProducts.length >= 2 && (
        <ComparisonTable products={comparisonProducts} />
      )}

      {/* Pros/Cons for review pages — uses structured data from product fields */}
      {isReview && heroProduct && (heroProduct.pros || heroProduct.cons) && (() => {
        const pros = heroProduct.pros
          ? heroProduct.pros.split("\n").map((s) => s.trim()).filter(Boolean)
          : [];
        const cons = heroProduct.cons
          ? heroProduct.cons.split("\n").map((s) => s.trim()).filter(Boolean)
          : [];
        return <ProsCons pros={pros} cons={cons} language={site.language} />;
      })()}

      {/* Content body with auto-linked product mentions */}
      <div className="mb-10">
        <HtmlRenderer
          html={injectProductLinks(
            content.body,
            linkedProducts.map((lp) => lp.product),
          )}
          direction={site.direction}
        />
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

      {/* Related content */}
      {relatedContent.length > 0 && (
        <section className="mt-10 border-t border-gray-200 pt-8">
          <h2 className="mb-6 text-2xl font-bold">
            {site.language === "ar" ? "محتوى ذو صلة" : "You Might Also Like"}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {relatedContent.map((item) => (
              <ContentCard key={item.id} content={item} locale={locale} />
            ))}
          </div>
        </section>
      )}

      {/* Sticky CTA bar */}
      {heroProduct && heroProduct.affiliate_url && (
        <StickyCtaBar product={heroProduct} />
      )}
    </article>
  );
}
