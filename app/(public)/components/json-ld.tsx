import type { SiteDefinition } from "@/config/site-definition";
import type { ContentRow, ProductRow } from "@/types/database";

interface JsonLdProps {
  data: Record<string, unknown>;
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

/** Organization schema for homepage */
export function organizationJsonLd(site: SiteDefinition) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.name,
    url: `https://${site.domain}`,
    description: site.brand.description,
    contactPoint: {
      "@type": "ContactPoint",
      email: site.brand.contactEmail,
      contactType: "customer support",
    },
  };
}

/** WebSite schema for homepage */
export function webSiteJsonLd(site: SiteDefinition) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: site.name,
    url: `https://${site.domain}`,
    description: site.brand.description,
    inLanguage: site.language,
  };
}

/** BreadcrumbList schema */
export function breadcrumbJsonLd(
  site: SiteDefinition,
  items: { name: string; path: string }[],
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `https://${site.domain}${item.path}`,
    })),
  };
}

/** Article schema for content pages */
export function articleJsonLd(site: SiteDefinition, content: ContentRow) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: content.title,
    description: content.excerpt || content.title,
    datePublished: content.created_at,
    dateModified: content.updated_at || content.created_at,
    author: content.author
      ? { "@type": "Person", name: content.author }
      : { "@type": "Organization", name: site.name },
    publisher: {
      "@type": "Organization",
      name: site.name,
      url: `https://${site.domain}`,
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://${site.domain}/${content.type}/${content.slug}`,
    },
    inLanguage: site.language,
  };
}

/** Review schema for review-type content */
export function reviewJsonLd(
  site: SiteDefinition,
  content: ContentRow,
  product?: ProductRow,
) {
  const base: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Review",
    headline: content.title,
    description: content.excerpt || content.title,
    datePublished: content.created_at,
    dateModified: content.updated_at || content.created_at,
    author: content.author
      ? { "@type": "Person", name: content.author }
      : { "@type": "Organization", name: site.name },
    publisher: {
      "@type": "Organization",
      name: site.name,
      url: `https://${site.domain}`,
    },
    inLanguage: site.language,
  };

  if (product) {
    base.itemReviewed = {
      "@type": "Product",
      name: product.name,
      ...(product.image_url ? { image: product.image_url } : {}),
      ...(product.description ? { description: product.description } : {}),
    };
    if (product.score !== null) {
      base.reviewRating = {
        "@type": "Rating",
        ratingValue: product.score,
        bestRating: 10,
        worstRating: 0,
      };
    }
  }

  return base;
}

/** FAQ schema — extracts Q&A pairs from HTML content with h3 questions */
export function faqJsonLd(html: string): Record<string, unknown> | null {
  // Match patterns like <h3>Question?</h3> followed by <p>Answer</p>
  const faqRegex = /<h[23][^>]*>([^<]*\?)<\/h[23]>\s*<p[^>]*>([^<]+)<\/p>/gi;
  const pairs: { question: string; answer: string }[] = [];
  let match;
  while ((match = faqRegex.exec(html)) !== null) {
    const question = match[1].trim();
    const answer = match[2].trim();
    if (question && answer) {
      pairs.push({ question, answer });
    }
  }

  if (pairs.length === 0) return null;

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: pairs.map((pair) => ({
      "@type": "Question",
      name: pair.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: pair.answer,
      },
    })),
  };
}

/** Product schema */
export function productJsonLd(site: SiteDefinition, product: ProductRow) {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description || product.name,
    url: `https://${site.domain}`,
  };

  if (product.image_url) {
    data.image = product.image_url;
  }

  if (product.price) {
    data.offers = {
      "@type": "Offer",
      price: product.price.replace(/[^0-9.]/g, "") || undefined,
      priceCurrency: product.price_currency || "USD",
      availability: "https://schema.org/InStock",
      url: product.affiliate_url || undefined,
    };
  }

  if (product.score !== null) {
    data.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: product.score,
      bestRating: 10,
      ratingCount: 1,
    };
  }

  if (product.merchant) {
    data.brand = {
      "@type": "Brand",
      name: product.merchant,
    };
  }

  return data;
}
