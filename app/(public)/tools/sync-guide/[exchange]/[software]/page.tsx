import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentSite } from "@/lib/site-context";
import { getProductBySlug } from "@/lib/dal/products";
import { getTenantClient } from "@/lib/supabase-server";
import {
  getSyncGuide,
  parseSyncParams,
  getAllSyncGuideParams,
  type SyncExchangeKey,
  type SyncSoftwareKey,
} from "@/lib/crypto-tax-au-tools";
import { ProductCard } from "../../../../components/product-card";
import { JsonLd, organizationJsonLd, breadcrumbJsonLd } from "../../../../components/json-ld";

export const revalidate = 60;

export async function generateStaticParams(): Promise<
  { exchange: SyncExchangeKey; software: SyncSoftwareKey }[]
> {
  return getAllSyncGuideParams();
}

interface Props {
  params: Promise<{ exchange: string; software: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const raw = await params;
  const parsed = parseSyncParams(raw.exchange, raw.software);
  if (!parsed) return {};
  const { exchange, software } = parsed;

  const guide = getSyncGuide(exchange, software);
  const site = await getCurrentSite();
  const title = `How to Sync ${guide.exchangeName} to ${guide.softwareName} for ATO Crypto Tax`;
  const description = `Step-by-step guide to import your ${guide.exchangeName} transactions into ${guide.softwareName} and generate an ATO-ready crypto tax report.`;

  return {
    metadataBase: new URL(`https://${site.domain}`),
    title,
    description,
    alternates: {
      canonical: `https://${site.domain}/tools/sync-guide/${exchange}/${software}`,
    },
    openGraph: {
      title,
      description,
      url: `https://${site.domain}/tools/sync-guide/${exchange}/${software}`,
      siteName: site.name,
      locale: site.locale,
      type: "article",
    },
  };
}

export default async function SyncGuidePage({ params }: Props) {
  const raw = await params;
  const parsed = parseSyncParams(raw.exchange, raw.software);
  if (!parsed) {
    notFound();
  }
  const { exchange, software } = parsed;

  const site = await getCurrentSite();
  const guide = getSyncGuide(exchange, software);
  const ctaProduct = await getProductBySlug(site.id, guide.ctaProductSlug, getTenantClient);

  const jsonLd = organizationJsonLd(site);
  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: "Tools", path: "/tools" },
    { name: "Sync Guides", path: "/tools/sync-guide/coinspot/koinly" },
    {
      name: `${guide.exchangeName} to ${guide.softwareName}`,
      path: `/tools/sync-guide/${exchange}/${software}`,
    },
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <JsonLd data={breadcrumbs} />
      <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
        How to Sync {guide.exchangeName} to {guide.softwareName} for ATO Crypto Tax
      </h1>
      <p className="mt-4 text-lg text-gray-600">
        Import your {guide.exchangeName} buy, sell and transfer history into {guide.softwareName} so
        you can calculate capital gains, income and losses under ATO rules.
      </p>

      <ol className="mt-8 list-decimal space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm pl-8 sm:p-8">
        {guide.steps.map((step, i) => (
          <li key={i} className="text-gray-700">
            {step}
          </li>
        ))}
      </ol>

      <div className="mt-6 rounded-xl border border-[color:var(--color-accent,#16A34A)]/20 bg-[color:var(--color-accent,#16A34A)]/5 p-6">
        <h2 className="font-semibold text-gray-900">Important note</h2>
        <p className="mt-1 text-sm text-gray-700">{guide.notes}</p>
      </div>

      {ctaProduct && (
        <div className="mt-8">
          <h2 className="mb-4 text-xl font-semibold text-gray-900">
            Get started with {guide.softwareName}
          </h2>
          <ProductCard product={ctaProduct} sourceType="sync-guide" variant="compact" />
        </div>
      )}

      <JsonLd data={jsonLd} />
    </main>
  );
}
