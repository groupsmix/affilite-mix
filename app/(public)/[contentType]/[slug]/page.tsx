import { getCurrentSite } from "@/lib/site-context";
import { getContentBySlug, getRelatedContent } from "@/lib/dal/content";
import { getLinkedProducts, getContentLinkedToProducts } from "@/lib/dal/content-products";
import { getCategoryById } from "@/lib/dal/categories";
import { injectProductLinks, buildRelatedLinks } from "@/lib/internal-links";
import { getAdminSession } from "@/lib/auth";
import { validatePreviewToken } from "@/lib/preview-token";
import { HtmlRenderer } from "../../components/html-renderer";
import { ProductCard } from "../../components/product-card";
import { ContentCard } from "../../components/content-card";
import { RelatedLinks } from "../../components/related-links";
import { AdSlot, adLabel, resolveSlotImageAd } from "../../components/ads/ad-slot";
import { AdImage } from "../../components/ads/ad-image";
import { Breadcrumbs } from "../../components/breadcrumbs";
import { cn } from "@/lib/utils";
import { ReportContentLink } from "../../components/report-content-link";
import dynamic from "next/dynamic";

const ComparisonTable = dynamic(() =>
  import("../../components/comparison-table").then((m) => m.ComparisonTable),
);
const StickyCtaBar = dynamic(() =>
  import("../../components/sticky-cta-bar").then((m) => m.StickyCtaBar),
);
const ReadingProgress = dynamic(() =>
  import("../../components/reading-progress").then((m) => m.ReadingProgress),
);
const VerdictBox = dynamic(() => import("../../components/verdict-box").then((m) => m.VerdictBox));
import { ProsCons } from "../../components/pros-cons";
import {
  JsonLd,
  articleJsonLd,
  reviewJsonLd,
  breadcrumbJsonLd,
  productJsonLd,
  faqJsonLd,
} from "../../components/json-ld";
import { notFound } from "next/navigation";
import { unstable_noStore } from "next/cache";
import type { Metadata } from "next";

/** Revalidate content detail pages every 60 seconds (ISR) */
export const revalidate = 60;

interface ContentPageProps {
  params: Promise<{ contentType: string; slug: string }>;
  searchParams: Promise<{ preview?: string; token?: string }>;
}

export async function generateMetadata({
  params,
  searchParams,
}: ContentPageProps): Promise<Metadata> {
  const { slug } = await params;
  const { preview, token } = await searchParams;
  const site = await getCurrentSite();

  // Support preview mode in metadata generation
  let isPreview = false;
  if (preview === "true") {
    if (token) {
      const tokenPayload = await validatePreviewToken(token);
      isPreview = !!(tokenPayload && tokenPayload.slug === slug);
    } else {
      const session = await getAdminSession();
      isPreview = !!session;
    }
  }

  const content = await getContentBySlug(site.id, slug, isPreview);

  if (!content) {
    return { title: site.language === "ar" ? "غير موجود" : "Not Found" };
  }

  const url = `https://${site.domain}/${content.type}/${content.slug}`;

  const metaTitle = content.meta_title || content.title;
  const metaDesc = content.meta_description || content.excerpt || "";
  const ogImageUrl = content.og_image || content.featured_image || undefined;
  const ogImages = ogImageUrl ? [{ url: ogImageUrl, width: 1200, height: 630 }] : undefined;

  // S5-05 / A109: Emit AI-generated provenance <meta> tag from the page
  // template (outside sanitized body HTML) so it cannot be stripped.
  const otherMeta = content.ai_generated ? { "ai-generated": "true" } : undefined;

  return {
    title: metaTitle,
    description: metaDesc,
    ...(otherMeta && { other: otherMeta }),
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: metaTitle,
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
      title: metaTitle,
      description: metaDesc || content.title,
      images: ogImages,
    },
  };
}

export default async function ContentPage({ params, searchParams }: ContentPageProps) {
  const { contentType, slug } = await params;
  const { preview, token } = await searchParams;

  // Never serve a cached 404 for preview requests.
  if (preview === "true") {
    unstable_noStore();
  }

  const site = await getCurrentSite();
  let isPreview = false;

  // Preview mode: authenticate via admin session or preview token
  if (preview === "true") {
    if (token) {
      // Token-based preview (shareable with non-admin reviewers)
      const tokenPayload = await validatePreviewToken(token);
      if (!tokenPayload || tokenPayload.slug !== slug) {
        notFound();
      }
      isPreview = true;
    } else {
      // Session-based preview (admin users)
      const session = await getAdminSession();
      if (!session) {
        notFound();
      }
      isPreview = true;
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

  // Load linked products, related content, and the category hub.
  const [linkedProducts, relatedContent, hubCategory] = await Promise.all([
    getLinkedProducts(site.id, content.id),
    getRelatedContent(site.id, content.category_id, content.id, 4),
    content.category_id ? getCategoryById(site.id, content.category_id) : Promise.resolve(null),
  ]);

  // CA-306: automated contextual internal links. Find published content that
  // references the same tools (reviews of the compared tools, comparisons that
  // feature this tool) via content_products, then build the related-links
  // groups. Depends on linkedProducts, so it runs after the Promise.all above.
  const productIds = linkedProducts.map((lp) => lp.product_id);
  const crossLinked = productIds.length
    ? await getContentLinkedToProducts(site.id, productIds, { excludeContentId: content.id })
    : [];
  const relatedLinkGroups = buildRelatedLinks({
    current: { id: content.id, type: content.type, slug: content.slug },
    language: site.language,
    categoryHub: hubCategory ? { slug: hubCategory.slug, name: hubCategory.name } : null,
    crossLinked: crossLinked.map((c) => c.content),
    sameCategory: relatedContent.map((c) => ({
      id: c.id,
      title: c.title,
      slug: c.slug,
      type: c.type,
    })),
  });

  // Build JSON-LD based on content type
  const contentTypeLabel =
    site.contentTypes.find((ct) => ct.value === content.type)?.label ?? content.type;
  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: contentTypeLabel, path: `/${content.type}` },
    { name: content.title, path: `/${content.type}/${content.slug}` },
  ]);

  const isReview = content.type === "review";
  const heroProduct =
    linkedProducts.find((lp) => lp.role === "hero")?.product ?? linkedProducts[0]?.product;

  // Separate comparison products (vs-left / vs-right)
  const vsLeft = linkedProducts.filter((lp) => lp.role === "vs-left").map((lp) => lp.product);
  const vsRight = linkedProducts.filter((lp) => lp.role === "vs-right").map((lp) => lp.product);
  const comparisonProducts = [...vsLeft, ...vsRight];
  const isComparison = content.type === "comparison" || comparisonProducts.length >= 2;

  // Verdict: rank the compared tools by score so we can declare a winner.
  // Tools without a score sink to the bottom; ties keep input (vs-left) order.
  const rankedComparison = [...comparisonProducts].sort(
    (a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity),
  );
  const comparisonWinner = rankedComparison[0];
  const comparisonRunnerUp = rankedComparison[1];

  const contentSchema = isReview
    ? reviewJsonLd(site, content, heroProduct)
    : articleJsonLd(site, content);

  // Build FAQ JSON-LD if content has FAQ-like structure
  const faqSchema = faqJsonLd(content.body);

  const locale = site.language === "ar" ? "ar-SA" : "en-US";

  // Freshness signal for the verdict box. Until ai_tools.last_verified_at exists
  // (backlog CA-201/CA-502), updated_at is the best available "last verified" date.
  const lastVerifiedLabel = content.updated_at
    ? new Date(content.updated_at).toLocaleDateString(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  // Resolve the sidebar ad up-front so we only reserve a sidebar column when a
  // renderable placement actually exists; pages without one keep the original
  // centred single-column reading width.
  const sidebarAd = await resolveSlotImageAd(site.id, "sidebar");

  return (
    <div
      className={cn("mx-auto px-4 py-8", sidebarAd ? "max-w-6xl lg:flex lg:gap-8" : "max-w-4xl")}
    >
      <article className={sidebarAd ? "min-w-0 flex-1" : undefined}>
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
          <div className="mb-2 text-sm text-gray-500">{contentTypeLabel}</div>
          <h1 className="mb-3 text-3xl font-bold leading-tight lg:text-4xl">{content.title}</h1>
          {content.excerpt && <p className="text-lg text-gray-600">{content.excerpt}</p>}
          {(content.publish_at ?? content.created_at) && (
            <time
              dateTime={content.publish_at ?? content.created_at}
              className="mt-2 block text-sm text-gray-500"
            >
              {new Date(content.publish_at ?? content.created_at).toLocaleDateString(locale, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
          )}
        </header>

        {/* Affiliate disclosure — only for sites that use affiliate monetization */}
        {linkedProducts.length > 0 && site.monetizationType !== "ads" && (
          <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {site.contentDisclosure}
          </div>
        )}

        {/* AI disclosure — EU AI Act Art. 50 compliance */}
        {content.ai_generated && (
          <aside
            role="note"
            aria-label="AI disclosure"
            className="mb-6 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800"
          >
            This content was generated with AI assistance and reviewed by a human editor.
          </aside>
        )}

        {/* Verdict (reviews) — bottom-line-up-front: score, price, CTA.
          Supersedes the former HeroProductCta with an explicit verdict line. */}
        {isReview && heroProduct && (
          <VerdictBox
            product={heroProduct}
            language={site.language}
            variant="review"
            verdict={content.excerpt || heroProduct.description}
            lastVerified={lastVerifiedLabel}
            priority
          />
        )}

        {/* Verdict (comparisons) — declare the winner above the spec table so the
          page answers "who wins" before any scrolling. */}
        {isComparison && comparisonWinner && (
          <VerdictBox
            product={comparisonWinner}
            language={site.language}
            variant="comparison"
            verdict={comparisonWinner.description}
            runnerUp={
              comparisonRunnerUp
                ? { name: comparisonRunnerUp.name, score: comparisonRunnerUp.score }
                : null
            }
            runnerUpProduct={comparisonRunnerUp ?? null}
            totalCompared={comparisonProducts.length}
            productLabelPlural={site.productLabelPlural}
            lastVerified={lastVerifiedLabel}
          />
        )}

        {/* Comparison table — full side-by-side detail */}
        {isComparison && comparisonProducts.length >= 2 && (
          <ComparisonTable products={comparisonProducts} />
        )}

        {/* Pros/Cons for review pages — uses structured data from product fields */}
        {isReview &&
          heroProduct &&
          (heroProduct.pros || heroProduct.cons) &&
          (() => {
            const pros = heroProduct.pros
              ? heroProduct.pros
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [];
            const cons = heroProduct.cons
              ? heroProduct.cons
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean)
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

        {/* In-article ad slot (renders only when an active image placement exists) */}
        <AdSlot placementType="in_content" className="mb-10 px-0" />

        {/* Linked products */}
        {linkedProducts.length > 0 && (
          <section className="mt-10 border-t border-gray-200 pt-8">
            <h2 className="mb-6 text-2xl font-bold">
              {site.language === "ar"
                ? `${site.productLabelPlural} المرتبطة`
                : `Related ${site.productLabelPlural}`}
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

        {/* CA-306: automated contextual internal links (reviews ⇄ comparisons,
          category hub, same-category siblings) — derived from content_products. */}
        <RelatedLinks groups={relatedLinkGroups} language={site.language} />

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

        {/* A159-01: Public content reporting link */}
        <div className="mt-10 border-t border-gray-200 pt-6 text-right">
          <ReportContentLink
            contentUrl={`https://${site.domain}/${content.type}/${content.slug}`}
            contentTitle={content.title}
            abuseEmail={site.brand.contactEmail}
          />
        </div>

        {/* Sticky CTA bar — only for affiliate/both sites */}
        {heroProduct && heroProduct.affiliate_url && site.monetizationType !== "ads" && (
          <StickyCtaBar product={heroProduct} />
        )}
      </article>
      {sidebarAd && (
        <aside className="mt-8 lg:mt-0 lg:w-72 lg:flex-shrink-0" aria-label="Advertisement">
          <div className="lg:sticky lg:top-24">
            <AdImage
              placementId={sidebarAd.placementId}
              imageUrl={sidebarAd.config.image_url}
              clickUrl={sidebarAd.config.click_url}
              alt={sidebarAd.config.alt}
              label={adLabel(site.language)}
            />
          </div>
        </aside>
      )}
    </div>
  );
}
