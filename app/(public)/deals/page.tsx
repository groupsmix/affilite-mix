import { getCurrentSite } from "@/lib/site-context";
import { resolveDbSiteBySlug } from "@/lib/dal/site-resolver";
import { shouldSkipDbCall } from "@/lib/db-available";
import { listActiveDeals } from "@/lib/dal/deals";
import { JsonLd, breadcrumbJsonLd } from "../components/json-ld";
import type { Metadata } from "next";
import type { DealRow } from "@/lib/dal/deals";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  return {
    title: `Today's Best Deals — ${site.name}`,
    description: `The latest watch deals, discounts, and price drops curated by ${site.name}. Updated daily.`,
  };
}

function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function DealCard({ deal }: { deal: DealRow }) {
  const hasExpiry = deal.expires_at !== null;
  const expiresDate = hasExpiry ? new Date(deal.expires_at!) : null;
  const isExpiringSoon = expiresDate && expiresDate.getTime() - Date.now() < 24 * 60 * 60 * 1000;

  return (
    <div className="relative overflow-hidden rounded-lg border bg-white shadow-sm transition-shadow hover:shadow-md">
      {/* Discount badge */}
      {deal.discount_pct && (
        <div className="absolute right-3 top-3 rounded-full bg-red-600 px-3 py-1 text-sm font-bold text-white">
          -{deal.discount_pct}%
        </div>
      )}

      <div className="p-5">
        <h3 className="text-lg font-semibold text-gray-900">{deal.title}</h3>

        {deal.description && <p className="mt-1 text-sm text-gray-600">{deal.description}</p>}

        {deal.source && (
          <span className="mt-2 inline-block rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            {deal.source}
          </span>
        )}

        {/* Pricing */}
        <div className="mt-3 flex items-baseline gap-3">
          {deal.deal_price !== null && (
            <span className="text-2xl font-bold text-green-700">
              {formatPrice(deal.deal_price, deal.currency)}
            </span>
          )}
          {deal.original_price !== null && (
            <span className="text-lg text-gray-400 line-through">
              {formatPrice(deal.original_price, deal.currency)}
            </span>
          )}
        </div>

        {/* Expiry */}
        {hasExpiry && expiresDate && (
          <p
            className={`mt-2 text-xs ${isExpiringSoon ? "font-semibold text-red-600" : "text-gray-500"}`}
          >
            {isExpiringSoon ? "Expires soon — " : "Expires "}
            {expiresDate.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        )}

        {/* CTA */}
        <a
          href={deal.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-4 inline-block w-full rounded-md bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-blue-700"
        >
          Get This Deal
        </a>
      </div>
    </div>
  );
}

export default async function DealsPage() {
  const site = await getCurrentSite();

  if (shouldSkipDbCall()) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center">
        <h1 className="text-3xl font-bold text-gray-900">Deals</h1>
        <p className="mt-4 text-gray-600">No deals available right now. Check back soon!</p>
      </div>
    );
  }

  const dbSite = await resolveDbSiteBySlug(site.id);
  if (!dbSite) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center">
        <h1 className="text-3xl font-bold text-gray-900">Deals</h1>
        <p className="mt-4 text-gray-600">No deals available right now.</p>
      </div>
    );
  }

  const deals = await listActiveDeals(dbSite.id);

  const breadcrumbs = [
    { name: "Home", path: "/" },
    { name: "Deals", path: "/deals" },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <JsonLd data={breadcrumbJsonLd(site, breadcrumbs)} />

      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900">Today&apos;s Best Deals</h1>
        <p className="mt-2 text-gray-600">Curated discounts and price drops, updated daily.</p>
      </div>

      {deals.length === 0 ? (
        <div className="rounded-lg border bg-gray-50 p-12 text-center">
          <p className="text-gray-600">No active deals right now. Check back tomorrow!</p>
          <p className="mt-2 text-sm text-gray-400">
            Subscribe to our newsletter for daily deal alerts.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} />
          ))}
        </div>
      )}
    </div>
  );
}
