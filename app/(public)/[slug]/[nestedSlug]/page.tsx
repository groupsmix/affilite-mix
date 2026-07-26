import { getCurrentSite } from "@/lib/site-context";
import { getContentBySlug, getRelatedContent } from "@/lib/dal/content";
import { getLinkedProducts, getContentLinkedToProducts } from "@/lib/dal/content-products";
import { getCategoryById } from "@/lib/dal/categories";
import { getAuthorById } from "@/lib/dal/authors";
import { injectProductLinks, buildRelatedLinks } from "@/lib/internal-links";
import { getAdminSession } from "@/lib/auth";
import { validatePreviewToken } from "@/lib/preview-token";
import { humanizeAuthorName, stripAiDisclosure } from "@/lib/human-content";
import { looksLikeMarkdown, markdownToHtml } from "@/lib/markdown";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { ProductCard } from "../../components/product-card";
import { ContentCard } from "../../components/content-card";
import { RelatedLinks } from "../../components/related-links";
import { AdSlot, adLabel, resolveSlotImageAd } from "../../components/ads/ad-slot";
import { AdImage } from "../../components/ads/ad-image";
import { ReportContentLink } from "../../components/report-content-link";
import { ArticleLayout } from "../../components/article/article-layout";
import dynamic from "next/dynamic";

const ComparisonTable = dynamic(() =>
  import("../../components/comparison-table").then((m) => m.ComparisonTable),
);
const StickyCtaBar = dynamic(() =>
  import("../../components/sticky-cta-bar").then((m) => m.StickyCtaBar),
);
const VerdictBox = dynamic(() => import("../../components/verdict-box").then((m) => m.VerdictBox));
const TopPickBanner = dynamic(() =>
  import("../../components/top-pick-banner").then((m) => m.TopPickBanner),
);
import { ProsCons } from "../../components/pros-cons";
import {
  JsonLd,
  articleJsonLd,
  reviewJsonLd,
  breadcrumbJsonLd,
  productJsonLd,
  faqJsonLd,
  itemListJsonLd,
} from "../../components/json-ld";
import { notFound, redirect } from "next/navigation";
import { unstable_noStore } from "next/cache";
import type { Metadata } from "next";

/** Revalidate content detail pages every 60 seconds (ISR) */
export const revalidate = 60;

interface ContentPageProps {
  params: Promise<{ slug: string; nestedSlug: string }>;
  searchParams: Promise<{ preview?: string; token?: string }>;
}

export async function generateMetadata({
  params,
  searchParams,
}: ContentPageProps): Promise<Metadata> {
  const { nestedSlug: slug } = await params;
  const { preview, token } = await searchParams;
  const site = await getCurrentSite();

  // Support preview mode in metadata generation
  let isPreview = false;
  if (preview === "true") {
    if (token) {
      const tokenPayload = await validatePreviewToken(token);
      isPreview = !!(tokenPayload && tokenPayload.slug === slug && tokenPayload.siteId === site.id);
    } else {
      const session = await getAdminSession();
      isPreview = !!session;
    }
  }

  const content = await getContentBySlug(site.id, slug, isPreview);

  if (!content) {
    return { title: site.language === "ar" ? "غير موجود" : "Not Found" };
  }

  // Preview of already-published content should redirect to the canonical URL.
  if (isPreview && content.status === "published") {
    redirect(`/${content.type}/${content.slug}`);
  }

  const url = `https://${site.domain}/${content.type}/${content.slug}`;

  const metaTitle = content.meta_title || content.title;
  const metaDesc = stripAiDisclosure(content.meta_description || content.excerpt || "");
  const ogImageUrl = content.og_image || content.featured_image || undefined;
  const ogImages = ogImageUrl ? [{ url: ogImageUrl, width: 1200, height: 630 }] : undefined;

  const displayAuthor = humanizeAuthorName(content.author, site.name);

  return {
    title: metaTitle,
    description: metaDesc,
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
      authors: displayAuthor ? [displayAuthor] : undefined,
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
  const { slug: contentType, nestedSlug: slug } = await params;
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
      if (!tokenPayload || tokenPayload.slug !== slug || tokenPayload.siteId !== site.id) {
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

  // Preview of already-published content should send the user to the canonical
  // public URL instead of keeping them on a tokenised preview link.
  if (isPreview && content.status === "published") {
    redirect(`/${content.type}/${content.slug}`);
  }

  // Load linked products, related content, the category hub, and the author.
  const [linkedProducts, relatedContent, hubCategory, author] = await Promise.all([
    getLinkedProducts(site.id, content.id),
    getRelatedContent(site.id, content.category_id, content.id, 4),
    content.category_id ? getCategoryById(site.id, content.category_id) : Promise.resolve(null),
    content.author_id ? getAuthorById(site.id, content.author_id) : Promise.resolve(null),
  ]);

  const displayAuthorName = humanizeAuthorName(author?.name ?? content.author, site.name);
  const displayAuthor = author ? { ...author, name: displayAuthorName } : null;
  const safeExcerpt = stripAiDisclosure(content.excerpt ?? "");
  const displayBody = stripAiDisclosure(content.body ?? "");
  const bodyHtmlBase = looksLikeMarkdown(displayBody) ? markdownToHtml(displayBody) : displayBody;
  const bodyHtmlSafe = sanitizeHtml(bodyHtmlBase);
  const bodyHtmlWithLinks = injectProductLinks(
    bodyHtmlSafe,
    linkedProducts.map((lp) => lp.product),
  );

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

  // Map each linked product to its review page for internal-linking from the
  // related-products cards.
  const reviewByProductId = new Map<string, { type: string; slug: string }>();
  for (const c of crossLinked) {
    if (c.content.type === "review" && !reviewByProductId.has(c.productId)) {
      reviewByProductId.set(c.productId, c.content);
    }
  }

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

  // For listicles/best-X round-ups, pick the highest-scored linked product as
  // the sticky "Our #1 Pick" CTA; if no scores exist, use the first linked item.
  const topPickProduct = [...linkedProducts.map((lp) => lp.product)].sort(
    (a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity),
  )[0];

  const contentSchema = isReview
    ? reviewJsonLd(site, content, heroProduct, displayAuthor)
    : articleJsonLd(site, content, displayAuthor);

  // Build FAQ JSON-LD if content has FAQ-like structure
  const faqSchema = faqJsonLd(bodyHtmlWithLinks);

  // Build ItemList JSON-LD for comparison/listicle content so "best X"
  // pages can appear as ranked lists in SERPs.
  const listProducts = isComparison
    ? rankedComparison
    : [...linkedProducts.map((lp) => lp.product)].sort(
        (a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity),
      );
  const itemListSchema = itemListJsonLd(site, content.title, listProducts);

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

  const jsonLd = (
    <>
      <JsonLd data={breadcrumbs} />
      <JsonLd data={contentSchema} />
      {faqSchema && <JsonLd data={faqSchema} />}
      {itemListSchema && <JsonLd data={itemListSchema} />}
      {linkedProducts.map((lp) => (
        <JsonLd key={lp.product_id} data={productJsonLd(site, lp.product)} />
      ))}
    </>
  );

  const rightSidebar = sidebarAd ? (
    <div className="lg:sticky lg:top-24">
      <AdImage
        placementId={sidebarAd.placementId}
        imageUrl={sidebarAd.config.image_url}
        clickUrl={sidebarAd.config.click_url}
        alt={sidebarAd.config.alt}
        label={adLabel(site.language)}
      />
    </div>
  ) : undefined;

  const preBody = (
    <>
      {/* Verdict (reviews) */}
      {isReview && heroProduct && (
        <VerdictBox
          product={heroProduct}
          language={site.language}
          variant="review"
          verdict={safeExcerpt || heroProduct.description}
          lastVerified={lastVerifiedLabel}
          priority
        />
      )}

      {/* Verdict (comparisons) */}
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

      {/* Top pick for listicles */}
      {!isReview && !isComparison && linkedProducts.length > 0 && topPickProduct && (
        <TopPickBanner
          product={topPickProduct}
          language={site.language}
          totalCompared={linkedProducts.length}
          lastVerified={lastVerifiedLabel}
        />
      )}

      {/* Comparison table */}
      {isComparison && comparisonProducts.length >= 2 && (
        <ComparisonTable products={comparisonProducts} />
      )}

      {/* Pros/Cons for reviews */}
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
    </>
  );

  const postBody = (
    <>
      <AdSlot placementType="in_content" className="mb-10 px-0" />

      {linkedProducts.length > 0 && (
        <section className="mt-10 border-t border-gray-200 pt-8">
          <h2 className="mb-6 text-2xl font-bold">
            {site.language === "ar"
              ? `${site.productLabelPlural} المرتبطة`
              : `Related ${site.productLabelPlural}`}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {linkedProducts.map((link) => {
              const review = reviewByProductId.get(link.product_id);
              return (
                <ProductCard
                  key={link.product_id}
                  product={link.product}
                  sourceType="content"
                  ctaLabel={site.language === "ar" ? "احصل على العرض" : "View Deal"}
                  relatedContentHref={review ? `/${review.type}/${review.slug}` : undefined}
                  relatedContentLabel={
                    site.language === "ar" ? "اقرأ المراجعة الكاملة →" : "Read our review →"
                  }
                />
              );
            })}
          </div>
        </section>
      )}

      <RelatedLinks groups={relatedLinkGroups} language={site.language} />

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

      <div className="mt-10 border-t border-gray-200 pt-6 text-right">
        <ReportContentLink
          contentUrl={`https://${site.domain}/${content.type}/${content.slug}`}
          contentTitle={content.title}
          abuseEmail={site.brand.contactEmail}
        />
      </div>

      {heroProduct && heroProduct.affiliate_url && site.monetizationType !== "ads" && (
        <StickyCtaBar product={heroProduct} />
      )}
    </>
  );

  return (
    <ArticleLayout
      content={content}
      site={site}
      author={displayAuthor}
      typeLabel={contentTypeLabel}
      backHref={`/${content.type}`}
      backLabel={contentTypeLabel}
      body={bodyHtmlWithLinks}
      bodyIsHtml
      disclosure={
        linkedProducts.length > 0 && site.monetizationType !== "ads"
          ? site.contentDisclosure
          : undefined
      }
      methodologyHref="/how-we-rank"
      rightSidebar={rightSidebar}
      jsonLd={jsonLd}
      preBody={preBody}
      postBody={postBody}
    />
  );
}
