import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentSite } from "@/lib/site-context";
import { getEtsyGuide, getAllEtsyGuideSlugs, getAllEtsyGuides } from "@/lib/etsy-guides";
import { HtmlRenderer } from "../../components/html-renderer";
import { JsonLd, organizationJsonLd, breadcrumbJsonLd, faqJsonLd } from "../../components/json-ld";
import { NewsletterSignup } from "../../components/newsletter-signup";
import Link from "next/link";

export const revalidate = 60;

export async function generateStaticParams() {
  return getAllEtsyGuideSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const site = await getCurrentSite();
  const guide = getEtsyGuide(slug);
  if (!guide) {
    return { title: "Not Found" };
  }
  const url = `https://${site.domain}/guide/${guide.slug}`;
  return {
    metadataBase: new URL(`https://${site.domain}`),
    title: guide.metaTitle,
    description: guide.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      title: guide.metaTitle,
      description: guide.metaDescription,
      url,
      siteName: site.name,
      locale: site.locale,
      type: "article",
      publishedTime: guide.datePublished,
      modifiedTime: guide.dateModified,
    },
  };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await getCurrentSite();
  const guide = getEtsyGuide(slug);
  if (!guide) notFound();

  const orgJsonLd = organizationJsonLd(site);
  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: "Guides", path: "/guide" },
    { name: guide.title, path: `/guide/${guide.slug}` },
  ]);

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    description: guide.metaDescription,
    datePublished: guide.datePublished,
    dateModified: guide.dateModified,
    author: { "@type": "Organization", name: site.name },
    publisher: { "@type": "Organization", name: site.name, url: `https://${site.domain}` },
    mainEntityOfPage: { "@type": "WebPage", "@id": `https://${site.domain}/guide/${guide.slug}` },
    inLanguage: site.language,
  };

  const faqJson = faqJsonLd(guide.bodyHtml);

  const allGuides = getAllEtsyGuides();
  const relatedGuides = allGuides
    .filter((g) => g.slug !== guide.slug && guide.relatedSlugs.includes(g.slug))
    .slice(0, 3);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      <JsonLd data={breadcrumbs} />
      <JsonLd data={orgJsonLd} />
      <JsonLd data={articleJsonLd} />
      {faqJson && <JsonLd data={faqJson} />}

      <article>
        <header className="mb-8">
          <div className="text-sm font-medium uppercase tracking-wide text-gray-500">Guide</div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {guide.title}
          </h1>
          <p className="mt-4 text-lg text-gray-600">{guide.metaDescription}</p>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
            <span>
              Published: <time dateTime={guide.datePublished}>{guide.datePublished}</time>
            </span>
            <span>
              Updated: <time dateTime={guide.dateModified}>{guide.dateModified}</time>
            </span>
          </div>
        </header>

        <div className="mb-8 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {site.contentDisclosure}
        </div>

        <HtmlRenderer html={guide.bodyHtml} direction={site.direction} />

        {relatedGuides.length > 0 && (
          <section className="mt-12 border-t border-gray-100 pt-8">
            <h2 className="text-xl font-semibold text-gray-900">Related guides</h2>
            <ul className="mt-4 space-y-3">
              {relatedGuides.map((g) => (
                <li key={g.slug}>
                  <Link
                    href={`/guide/${g.slug}`}
                    className="text-base font-medium hover:underline"
                    style={{ color: "var(--color-accent-text, var(--color-accent))" }}
                  >
                    {g.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-12 rounded-2xl border border-gray-200 bg-white p-6 sm:p-8">
          <h2 className="text-xl font-semibold text-gray-900">
            Get the Etsy AI Workflow Checklist
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            A printable checklist covering research, design, listing, and disclosure — plus the
            first tools to test.
          </p>
          <div className="mt-4 max-w-xl">
            <NewsletterSignup siteLanguage={site.language} />
          </div>
        </section>
      </article>
    </main>
  );
}
