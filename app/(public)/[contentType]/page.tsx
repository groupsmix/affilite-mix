import { getCurrentSite } from "@/lib/site-context";
import { listPublishedContent, countPublishedContent } from "@/lib/dal/content";
import { ContentCard } from "../components/content-card";
import { Pagination } from "../components/pagination";
import { Breadcrumbs } from "../components/breadcrumbs";
import { JsonLd, breadcrumbJsonLd } from "../components/json-ld";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

/** Revalidate content type listing pages every 60 seconds (ISR) */
export const revalidate = 60;

const PAGE_SIZE = 12;

interface ContentTypePageProps {
  params: Promise<{ contentType: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params }: ContentTypePageProps): Promise<Metadata> {
  const { contentType } = await params;
  const site = await getCurrentSite();
  const ct = site.contentTypes.find((c) => c.value === contentType);

  if (!ct) return { title: "Not Found" };

  const url = `https://${site.domain}/${contentType}`;
  const plural = ct.labelPlural ?? `${ct.label}s`;
  const description = `Browse all ${plural.toLowerCase()} on ${site.name}`;

  return {
    title: `${plural} — ${site.name}`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${plural} — ${site.name}`,
      description,
      url,
      siteName: site.name,
      locale: site.locale,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: `${plural} — ${site.name}`,
      description,
    },
  };
}

export default async function ContentTypePage({ params, searchParams }: ContentTypePageProps) {
  const { contentType } = await params;
  const { page } = await searchParams;
  const site = await getCurrentSite();

  // Prevent accessing admin or api routes through this catch-all
  if (
    contentType === "admin" ||
    contentType === "api" ||
    contentType === "category" ||
    contentType === "search"
  ) {
    notFound();
  }

  const ct = site.contentTypes.find((c) => c.value === contentType);
  if (!ct) notFound();

  const currentPage = Math.max(1, parseInt(page ?? "1", 10) || 1);
  const offset = (currentPage - 1) * PAGE_SIZE;

  const [items, totalItems] = await Promise.all([
    listPublishedContent(site.id, contentType, PAGE_SIZE, offset),
    countPublishedContent(site.id, contentType),
  ]);

  const locale = site.language === "ar" ? "ar-SA" : "en-US";

  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: ct.label, path: `/${contentType}` },
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <JsonLd data={breadcrumbs} />

      <Breadcrumbs items={[{ label: site.name, href: "/" }, { label: ct.label }]} />

      <header className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">
          {site.language === "ar" ? ct.label : (ct.labelPlural ?? `${ct.label}s`)}
        </h1>
        {/* Content type filter tabs */}
        {site.contentTypes.length > 1 && (
          <nav className="mt-4 flex flex-wrap gap-2" aria-label="Content type filter">
            {site.contentTypes.map((t) => {
              const isActive = t.value === contentType;
              return (
                <a
                  key={t.value}
                  href={`/${t.value}`}
                  className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                >
                  {t.labelPlural ?? `${t.label}s`}
                </a>
              );
            })}
          </nav>
        )}
      </header>

      {items.length > 0 ? (
        <>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <ContentCard key={item.id} content={item} locale={locale} />
            ))}
          </div>
          <Pagination
            currentPage={currentPage}
            totalItems={totalItems}
            pageSize={PAGE_SIZE}
            basePath={`/${contentType}`}
          />
        </>
      ) : (
        <div className="py-16 text-center text-gray-500">
          <p className="text-lg">
            {site.language === "ar"
              ? `لا يوجد ${ct.label} بعد`
              : `No ${(ct.labelPlural ?? `${ct.label}s`).toLowerCase()} yet`}
          </p>
        </div>
      )}
    </div>
  );
}
