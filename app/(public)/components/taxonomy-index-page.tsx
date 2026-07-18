import { getCurrentSite } from "@/lib/site-context";
import { listCategoriesByTaxonomy } from "@/lib/dal/categories";
import { Breadcrumbs } from "./breadcrumbs";
import { JsonLd, breadcrumbJsonLd } from "./json-ld";
import { NewsletterSignup } from "./newsletter-signup";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { TaxonomyType } from "@/types/database";

export interface TaxonomyIndexConfig {
  /** URL prefix, e.g. "budget", "occasion", "recipient", "brands" */
  prefix: string;
  /** Human-readable label for breadcrumbs, e.g. "Shop by Budget" */
  label: string;
  /** The taxonomy_type value in the DB */
  taxonomyType: TaxonomyType;
  /** Description for the page */
  description: string;
  /**
   * The site feature flag that gates this taxonomy family. The index returns
   * 404 on any tenant that does not enable it, keeping off-niche taxonomy off
   * sites (e.g. the watch gift taxonomy stays on wristnerd, not compareai).
   */
  feature: "taxonomyPages" | "brandSpotlights";
}

export async function generateTaxonomyIndexMetadata(
  config: TaxonomyIndexConfig,
): Promise<Metadata> {
  const site = await getCurrentSite();

  // Tenant gate: emit no metadata for sites that don't enable this taxonomy
  // family, so a 404 page never advertises a canonical/title.
  if (!site.features[config.feature]) {
    return {};
  }

  const url = `https://${site.domain}/${config.prefix}`;

  return {
    title: `${config.label} — ${site.name}`,
    description: config.description,
    alternates: { canonical: url },
    openGraph: {
      title: `${config.label} — ${site.name}`,
      description: config.description,
      url,
      siteName: site.name,
      locale: site.locale,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: `${config.label} — ${site.name}`,
      description: config.description,
    },
  };
}

export async function TaxonomyIndexPage({ config }: { config: TaxonomyIndexConfig }) {
  const site = await getCurrentSite();

  // Tenant gate: 404 on sites that don't enable this taxonomy family.
  if (!site.features[config.feature]) {
    notFound();
  }

  const categories = await listCategoriesByTaxonomy(site.id, config.taxonomyType);

  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: config.label, path: `/${config.prefix}` },
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <JsonLd data={breadcrumbs} />

      <Breadcrumbs items={[{ label: site.name, href: "/" }, { label: config.label }]} />

      <header className="mb-10">
        <h1 className="max-w-3xl text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
          {config.label}
        </h1>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed text-gray-600">{config.description}</p>
      </header>

      {categories.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={`/${config.prefix}/${cat.slug}`}
              className="group rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[color:var(--color-accent,#16A34A)]/20 hover:shadow-md"
            >
              <h2 className="mb-2 text-lg font-bold text-gray-900 transition-colors group-hover:[color:var(--color-accent-text,#15803D)]">
                {cat.name}
              </h2>
              {cat.description && (
                <p className="text-sm leading-relaxed text-gray-500">{cat.description}</p>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-100 bg-gray-50 py-16 text-center text-gray-500">
          <p className="text-lg">
            {site.language === "ar" ? "لا توجد تصنيفات بعد" : "No categories yet"}
          </p>
        </div>
      )}

      {site.features.newsletter && (
        <section className="mt-12">
          <NewsletterSignup siteLanguage={site.language} />
        </section>
      )}
    </main>
  );
}
