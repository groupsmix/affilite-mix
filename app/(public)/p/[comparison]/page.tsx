import { notFound } from "next/navigation";
import { getCurrentSite } from "@/lib/site-context";
import { resolveDbSiteBySlug } from "@/lib/dal/site-resolver";
import { getServiceClient } from "@/lib/supabase-server";
import { shouldSkipDbCall } from "@/lib/db-available";
import { JsonLd, breadcrumbJsonLd, productJsonLd } from "../../components/json-ld";
import { PriceHistoryChart } from "../../components/price-history-chart";
import { PriceAlertForm } from "../../components/price-alert-form";
import type { ProductRow } from "@/types/database";
import type { Metadata } from "next";
import type { SiteDefinition } from "@/config/site-definition";

interface ComparisonPageProps {
  params: Promise<{ comparison: string }>;
}

function parseComparisonSlug(slug: string): { slugA: string; slugB: string } | null {
  const match = slug.match(/^(.+)-vs-(.+)$/);
  if (!match) return null;
  return { slugA: match[1], slugB: match[2] };
}

async function getProducts(siteId: string, slugA: string, slugB: string) {
  const sb = getServiceClient();
  const { data } = await sb
    .from("products")
    .select("*")
    .eq("site_id", siteId)
    .in("slug", [slugA, slugB])
    .eq("status", "active");

  if (!data || data.length < 2) return null;

  const rows = data as unknown as ProductRow[];
  const productA = rows.find((p) => p.slug === slugA);
  const productB = rows.find((p) => p.slug === slugB);

  if (!productA || !productB) return null;
  return { productA, productB };
}

export async function generateMetadata({ params }: ComparisonPageProps): Promise<Metadata> {
  const { comparison } = await params;
  const parsed = parseComparisonSlug(comparison);
  if (!parsed) return { title: "Comparison" };

  const site = await getCurrentSite();
  const title = `${parsed.slugA.replace(/-/g, " ")} vs ${parsed.slugB.replace(/-/g, " ")} — ${site.name}`;

  return {
    title,
    description: `Compare ${parsed.slugA.replace(/-/g, " ")} and ${parsed.slugB.replace(/-/g, " ")} side by side. Specs, prices, pros & cons.`,
  };
}

function SpecRow({ label, valueA, valueB }: { label: string; valueA: string; valueB: string }) {
  return (
    <tr className="border-b border-gray-100">
      <td className="px-4 py-3 text-sm font-medium text-gray-600">{label}</td>
      <td className="px-4 py-3 text-sm text-gray-900">{valueA || "—"}</td>
      <td className="px-4 py-3 text-sm text-gray-900">{valueB || "—"}</td>
    </tr>
  );
}

export default async function ComparisonPage({ params }: ComparisonPageProps) {
  const { comparison } = await params;
  const parsed = parseComparisonSlug(comparison);
  if (!parsed) notFound();

  const site = await getCurrentSite();

  if (shouldSkipDbCall()) notFound();

  const dbSite = await resolveDbSiteBySlug(site.id);
  if (!dbSite) notFound();

  const result = await getProducts(dbSite.id, parsed.slugA, parsed.slugB);
  if (!result) notFound();

  const { productA, productB } = result;

  const breadcrumbs = [
    { name: "Home", path: "/" },
    { name: "Compare", path: "/p" },
    { name: `${productA.name} vs ${productB.name}`, path: `/p/${comparison}` },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* JSON-LD */}
      <JsonLd data={breadcrumbJsonLd(site, breadcrumbs)} />
      <JsonLd data={productJsonLd(site as unknown as SiteDefinition, productA)} />
      <JsonLd data={productJsonLd(site as unknown as SiteDefinition, productB)} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `${productA.name} vs ${productB.name}`,
          itemListElement: [
            { "@type": "ListItem", position: 1, item: { "@type": "Product", name: productA.name } },
            { "@type": "ListItem", position: 2, item: { "@type": "Product", name: productB.name } },
          ],
        }}
      />

      {/* Header */}
      <h1 className="text-center text-3xl font-bold text-gray-900">
        {productA.name} <span className="text-gray-400">vs</span> {productB.name}
      </h1>
      <p className="mt-2 text-center text-gray-600">
        Side-by-side comparison of specs, pricing, and our verdict.
      </p>

      {/* Product images + CTA */}
      <div className="mt-8 grid grid-cols-2 gap-8">
        {[productA, productB].map((product) => (
          <div key={product.id} className="text-center">
            {product.image_url && (
              <img
                src={product.image_url}
                alt={product.image_alt || product.name}
                className="mx-auto h-48 w-48 rounded-lg object-cover"
              />
            )}
            <h2 className="mt-3 text-lg font-semibold text-gray-900">{product.name}</h2>
            {product.merchant && <p className="text-sm text-gray-500">{product.merchant}</p>}
            {product.price && (
              <p className="mt-1 text-xl font-bold text-gray-900">{product.price}</p>
            )}
            {product.score !== null && (
              <div className="mt-1 inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800">
                {product.score}/10
              </div>
            )}
            {product.affiliate_url && (
              <a
                href={`/r/${product.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                {product.cta_text || "Check Price"}
              </a>
            )}
          </div>
        ))}
      </div>

      {/* Spec comparison table */}
      <div className="mt-10">
        <h2 className="mb-4 text-xl font-bold text-gray-900">Specifications</h2>
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Feature</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                {productA.name}
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">
                {productB.name}
              </th>
            </tr>
          </thead>
          <tbody>
            <SpecRow label="Brand" valueA={productA.merchant} valueB={productB.merchant} />
            <SpecRow label="Price" valueA={productA.price} valueB={productB.price} />
            <SpecRow
              label="Score"
              valueA={productA.score !== null ? `${productA.score}/10` : "—"}
              valueB={productB.score !== null ? `${productB.score}/10` : "—"}
            />
            <SpecRow label="Pros" valueA={productA.pros} valueB={productB.pros} />
            <SpecRow label="Cons" valueA={productA.cons} valueB={productB.cons} />
          </tbody>
        </table>
      </div>

      {/* Price history for both */}
      <div className="mt-10 grid grid-cols-2 gap-8">
        <div>
          <h3 className="mb-2 font-semibold text-gray-900">{productA.name} Price History</h3>
          <PriceHistoryChart productId={productA.id} />
          <div className="mt-3">
            <PriceAlertForm
              productId={productA.id}
              productName={productA.name}
              currentPrice={productA.price_amount ?? undefined}
              currency={productA.price_currency}
            />
          </div>
        </div>
        <div>
          <h3 className="mb-2 font-semibold text-gray-900">{productB.name} Price History</h3>
          <PriceHistoryChart productId={productB.id} />
          <div className="mt-3">
            <PriceAlertForm
              productId={productB.id}
              productName={productB.name}
              currentPrice={productB.price_amount ?? undefined}
              currency={productB.price_currency}
            />
          </div>
        </div>
      </div>

      {/* Verdict */}
      <div className="mt-10 rounded-lg border bg-gray-50 p-6">
        <h2 className="text-xl font-bold text-gray-900">Our Verdict</h2>
        <p className="mt-2 text-gray-700">
          {productA.score !== null && productB.score !== null ? (
            productA.score > productB.score ? (
              <>
                <strong>{productA.name}</strong> edges out with a score of{" "}
                <strong>{productA.score}/10</strong> vs <strong>{productB.score}/10</strong> for the{" "}
                {productB.name}.
                {productA.price_amount &&
                productB.price_amount &&
                productA.price_amount > productB.price_amount
                  ? ` However, the ${productB.name} offers better value at a lower price point.`
                  : ""}
              </>
            ) : productB.score > productA.score ? (
              <>
                <strong>{productB.name}</strong> takes the lead with a score of{" "}
                <strong>{productB.score}/10</strong> vs <strong>{productA.score}/10</strong> for the{" "}
                {productA.name}.
              </>
            ) : (
              <>
                Both products score equally at <strong>{productA.score}/10</strong>. Your choice
                comes down to personal preference and price.
              </>
            )
          ) : (
            <>
              Compare the specs and pricing above to make your decision. Both are solid choices in
              their category.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
