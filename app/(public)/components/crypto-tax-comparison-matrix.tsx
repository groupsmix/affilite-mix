"use client";

import type { ProductRow } from "@/types/database";
import { ProductLogo } from "./product-logo";
import { GiftWorthinessScore } from "./gift-worthiness-score";
import { useCookieConsent } from "./cookie-consent";
import { getTrackingUrl } from "@/lib/tracking-url";
import { hasUsableAffiliateUrl } from "@/lib/affiliate-url";
import {
  COMPARISON_FEATURES,
  CRYPTO_TAX_PRODUCT_FEATURES,
  type CryptoTaxProductFeatures,
  type ComparableFeatureKey,
} from "@/lib/crypto-tax-au-tools";

interface CryptoTaxComparisonMatrixProps {
  products: ProductRow[];
}

function featureValue(product: ProductRow, key: ComparableFeatureKey): string {
  return CRYPTO_TAX_PRODUCT_FEATURES[product.slug]?.[key] ?? "—";
}

export function CryptoTaxComparisonMatrix({ products }: CryptoTaxComparisonMatrixProps) {
  const { accepted: hasConsent } = useCookieConsent();

  if (products.length < 2) {
    return (
      <p className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        Not enough products to build a comparison.
      </p>
    );
  }

  return (
    <div className="mb-8">
      {/* Card layout on mobile */}
      <div className="grid gap-4 sm:hidden">
        {products.map((p) => (
          <div key={p.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-3">
              <ProductLogo name={p.name} src={p.image_url} alt={p.image_alt ?? p.name} size={40} />
              <div>
                <h3 className="font-semibold text-gray-900">{p.name}</h3>
                {p.score !== null && (
                  <GiftWorthinessScore score={p.score} size="sm" showLabel={false} />
                )}
              </div>
            </div>
            <dl className="space-y-2 text-sm">
              {COMPARISON_FEATURES.map(({ key, label }) => (
                <div key={key} className="flex justify-between gap-2">
                  <dt className="font-medium text-gray-600">{label}</dt>
                  <dd className="max-w-[55%] text-end text-gray-800">{featureValue(p, key)}</dd>
                </div>
              ))}
            </dl>
            {hasUsableAffiliateUrl(p.affiliate_url) && (
              <a
                href={getTrackingUrl(p.slug, "comparison-matrix", p.affiliate_url, hasConsent)}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="mt-4 block rounded-md border border-slate-900 bg-white px-4 py-2 text-center text-sm font-medium text-slate-900 transition-colors hover:bg-slate-900 hover:text-white"
              >
                {p.cta_text || `Visit ${p.name}`}
              </a>
            )}
          </div>
        ))}
      </div>

      {/* Table layout on sm+ */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse rounded-xl border border-gray-200 bg-white text-sm shadow-sm">
          <thead>
            <tr className="bg-gray-50">
              <th
                scope="col"
                className="border-b border-gray-200 px-4 py-3 text-start font-medium text-gray-500"
              >
                Feature
              </th>
              {products.map((p) => (
                <th
                  key={p.id}
                  scope="col"
                  className="border-b border-gray-200 px-4 py-3 text-center font-semibold text-gray-900"
                >
                  <div className="flex flex-col items-center gap-2">
                    <ProductLogo
                      name={p.name}
                      src={p.image_url}
                      alt={p.image_alt ?? p.name}
                      size={40}
                    />
                    <span>{p.name}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th
                scope="row"
                className="border-b border-gray-100 px-4 py-3 text-start font-medium text-gray-600"
              >
                Score
              </th>
              {products.map((p) => (
                <td key={p.id} className="border-b border-gray-100 px-4 py-3 text-center">
                  {p.score !== null ? (
                    <div className="inline-flex justify-center">
                      <GiftWorthinessScore score={p.score} size="sm" showLabel={false} />
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
              ))}
            </tr>
            {COMPARISON_FEATURES.map(({ key, label }) => (
              <tr key={key}>
                <th
                  scope="row"
                  className="border-b border-gray-100 px-4 py-3 text-start font-medium text-gray-600"
                >
                  {label}
                </th>
                {products.map((p) => (
                  <td
                    key={p.id}
                    className="border-b border-gray-100 px-4 py-3 text-center text-gray-700"
                  >
                    {featureValue(p, key)}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="border-t border-gray-200 px-4 py-3" />
              {products.map((p) => (
                <td key={p.id} className="border-t border-gray-200 px-4 py-3 text-center">
                  {hasUsableAffiliateUrl(p.affiliate_url) && (
                    <a
                      href={getTrackingUrl(
                        p.slug,
                        "comparison-matrix",
                        p.affiliate_url,
                        hasConsent,
                      )}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-block rounded-md border border-slate-900 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-900 hover:text-white"
                    >
                      {p.cta_text || `Visit ${p.name}`}
                    </a>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
