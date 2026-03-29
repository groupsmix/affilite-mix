import { getCurrentSite } from "@/lib/site-context";
import { listCategoriesByTaxonomy } from "@/lib/dal/categories";
import { Breadcrumbs } from "./breadcrumbs";
import { JsonLd, breadcrumbJsonLd } from "./json-ld";
import { NewsletterSignup } from "./newsletter-signup";
import Link from "next/link";
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
}

export async function generateTaxonomyIndexMetadata(
  config: TaxonomyIndexConfig,
): Promise<Metadata> {
  const site = await getCurrentSite();
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

export async function TaxonomyIndexPage({
  config,
}: {
  config: TaxonomyIndexConfig;
}) {
  const site = await getCurrentSite();
  const categories = await listCategoriesByTaxonomy(site.id, config.taxonomyType);

  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: config.label, path: `/${config.prefix}` },
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <JsonLd data={breadcrumbs} />

      <Breadcrumbs
        items={[
          { label: site.name, href: "/" },
          { label: config.label },
        ]}
      />

      <header className="mb-10">
        <h1 className="mb-3 text-3xl font-bold">{config.label}</h1>
        <p className="max-w-2xl text-gray-600">{config.description}</p>
      </header>

      {categories.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={`/${config.prefix}/${cat.slug}`}
              className="group rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-md"
            >
              <h2 className="mb-2 text-lg font-semibold text-gray-900 group-hover:text-blue-600">
                {cat.name}
              </h2>
              {cat.description && (
                <p className="text-sm text-gray-500">{cat.description}</p>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <div className="py-16 text-center text-gray-400">
          <p className="text-lg">
            {site.language === "ar"
              ? "لا توجد تصنيفات بعد"
              : "No categories yet"}
          </p>
        </div>
      )}

      <section className="mt-12">
        <NewsletterSignup siteLanguage={site.language} />
      </section>
    </div>
  );
}
