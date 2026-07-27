import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentSite } from "@/lib/site-context";
import { getAllSiteGuides } from "@/lib/site-guides";
import { JsonLd, organizationJsonLd, breadcrumbJsonLd } from "../components/json-ld";
import { ContentTypeListing } from "../[slug]/content-type-listing";

export const revalidate = 60;

const GUIDE_DESCRIPTIONS: Record<string, string> = {
  "watch-tools":
    "Practical, evidence-based watch buying guides. Best watches under $500, $300, $200, dress watches, vintage Casio and Seiko, leather straps, and more.",
  "ai-compared":
    "Step-by-step guides for Etsy print-on-demand and digital-product sellers: research, design, listing optimization, disclosure, and AI workflows.",
};

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  const guides = getAllSiteGuides(site.slug ?? site.id);
  if (guides.length === 0) {
    const ct = site.contentTypes.find((c) => c.value === "guide");
    if (ct) {
      const url = `https://${site.domain}/guide`;
      const plural = ct.labelPlural ?? `${ct.label}s`;
      return {
        metadataBase: new URL(`https://${site.domain}`),
        title: `${plural} — ${site.name}`,
        description: `Browse all ${plural.toLowerCase()} on ${site.name}`,
        alternates: { canonical: url },
        openGraph: {
          title: `${plural} — ${site.name}`,
          description: `Browse all ${plural.toLowerCase()} on ${site.name}`,
          url,
          siteName: site.name,
          locale: site.locale,
          type: "website",
        },
      };
    }
    return { title: "Not Found" };
  }
  const url = `https://${site.domain}/guide`;
  const title = `${site.productLabelPlural} Buying Guides | ${site.name}`;
  const description =
    GUIDE_DESCRIPTIONS[site.slug ?? site.id] ??
    `Practical buying guides and how-tos from ${site.name}.`;
  return {
    metadataBase: new URL(`https://${site.domain}`),
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: site.name,
      locale: site.locale,
      type: "website",
    },
  };
}

export default async function GuideHubPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const site = await getCurrentSite();
  const { page } = await searchParams;
  const guides = getAllSiteGuides(site.slug ?? site.id);
  if (guides.length === 0) {
    const ct = site.contentTypes.find((c) => c.value === "guide");
    if (!ct) notFound();
    return <ContentTypeListing site={site} contentType="guide" page={page} />;
  }

  const orgJsonLd = organizationJsonLd(site);
  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: "Guides", path: "/guide" },
  ]);

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: guides.map((g, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `https://${site.domain}/guide/${g.slug}`,
      name: g.title,
    })),
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <JsonLd data={orgJsonLd} />
      <JsonLd data={breadcrumbs} />
      <JsonLd data={itemListJsonLd} />

      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          {site.productLabelPlural} Buying Guides
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-gray-600">
          Practical, evidence-based {site.productLabelPlural.toLowerCase()} buying guides. We
          compare price, features, and value so you can choose with confidence.
        </p>
      </header>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {guides.map((guide) => (
          <article
            key={guide.slug}
            className="group flex flex-col rounded-2xl border border-gray-200 bg-white p-6 transition hover:shadow-md"
          >
            <h2 className="text-lg font-semibold text-gray-900 group-hover:underline">
              <Link href={`/guide/${guide.slug}`}>{guide.title}</Link>
            </h2>
            <p className="mt-2 flex-1 text-sm text-gray-600">{guide.excerpt}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {guide.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700"
                >
                  {tag}
                </span>
              ))}
            </div>
            <Link
              href={`/guide/${guide.slug}`}
              className="mt-4 text-sm font-medium hover:underline"
              style={{ color: "var(--color-accent-text, var(--color-accent))" }}
            >
              Read guide →
            </Link>
          </article>
        ))}
      </div>
    </main>
  );
}
