"use client";

import { useMemo, useState } from "react";
import type { ProductRow } from "@/types/database";
import { ProductLogo } from "./product-logo";
import { useCookieConsent } from "./cookie-consent";
import { getTrackingUrl } from "@/lib/tracking-url";
import { hasUsableAffiliateUrl } from "@/lib/affiliate-url";

interface CgtCalculatorProps {
  ctaProduct: ProductRow | null;
}

function getMarginalTaxRate(annualIncome: number): number {
  // Simplified 2024–25 Australian resident individual rates (stage 3).
  if (annualIncome <= 18200) return 0;
  if (annualIncome <= 45000) return 0.16;
  if (annualIncome <= 135000) return 0.3;
  if (annualIncome <= 190000) return 0.37;
  return 0.45;
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);
}

export function CgtCalculator({ ctaProduct }: CgtCalculatorProps) {
  const [buyPrice, setBuyPrice] = useState<string>("");
  const [sellPrice, setSellPrice] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("1");
  const [heldMoreThanYear, setHeldMoreThanYear] = useState<boolean>(false);
  const [annualIncome, setAnnualIncome] = useState<string>("90000");
  const [includeMedicare, setIncludeMedicare] = useState<boolean>(true);
  const [capitalLosses, setCapitalLosses] = useState<string>("0");

  const { accepted: hasConsent } = useCookieConsent();

  const result = useMemo(() => {
    const buy = Math.max(0, parseFloat(buyPrice) || 0);
    const sell = Math.max(0, parseFloat(sellPrice) || 0);
    const qty = Math.max(0, parseFloat(quantity) || 0);
    const income = Math.max(0, parseFloat(annualIncome) || 0);
    const losses = Math.max(0, parseFloat(capitalLosses) || 0);

    const proceeds = sell * qty;
    const costBase = buy * qty;
    const grossGain = proceeds - costBase;

    if (grossGain <= 0) {
      return {
        proceeds,
        costBase,
        grossGain,
        discount: 0,
        netGain: grossGain,
        tax: 0,
        taxRate: 0,
        effectiveRate: 0,
        loss: true,
      };
    }

    const netBeforeDiscount = Math.max(0, grossGain - losses);
    const discount = heldMoreThanYear ? netBeforeDiscount * 0.5 : 0;
    const netGain = netBeforeDiscount - discount;

    const marginalRate = getMarginalTaxRate(income);
    const medicareRate = includeMedicare ? 0.02 : 0;
    const taxRate = marginalRate + medicareRate;
    const tax = Math.max(0, netGain * taxRate);
    const effectiveRate = tax / grossGain;

    return {
      proceeds,
      costBase,
      grossGain,
      discount,
      netGain,
      tax,
      taxRate,
      effectiveRate,
      loss: false,
    };
  }, [
    buyPrice,
    sellPrice,
    quantity,
    heldMoreThanYear,
    annualIncome,
    includeMedicare,
    capitalLosses,
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label htmlFor="buyPrice" className="block text-sm font-medium text-gray-700">
              Buy price per coin (AUD)
            </label>
            <input
              id="buyPrice"
              type="number"
              min="0"
              step="0.01"
              value={buyPrice}
              onChange={(e) => setBuyPrice(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-[color:var(--color-accent,#16A34A)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent,#16A34A)]/20"
              placeholder="e.g. 50000"
            />
          </div>
          <div>
            <label htmlFor="sellPrice" className="block text-sm font-medium text-gray-700">
              Sell price per coin (AUD)
            </label>
            <input
              id="sellPrice"
              type="number"
              min="0"
              step="0.01"
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-[color:var(--color-accent,#16A34A)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent,#16A34A)]/20"
              placeholder="e.g. 70000"
            />
          </div>
          <div>
            <label htmlFor="quantity" className="block text-sm font-medium text-gray-700">
              Quantity
            </label>
            <input
              id="quantity"
              type="number"
              min="0"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-[color:var(--color-accent,#16A34A)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent,#16A34A)]/20"
            />
          </div>
          <div>
            <label htmlFor="income" className="block text-sm font-medium text-gray-700">
              Annual taxable income (AUD)
            </label>
            <input
              id="income"
              type="number"
              min="0"
              step="1000"
              value={annualIncome}
              onChange={(e) => setAnnualIncome(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-[color:var(--color-accent,#16A34A)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent,#16A34A)]/20"
            />
          </div>
          <div>
            <label htmlFor="losses" className="block text-sm font-medium text-gray-700">
              Capital losses to apply (AUD)
            </label>
            <input
              id="losses"
              type="number"
              min="0"
              step="0.01"
              value={capitalLosses}
              onChange={(e) => setCapitalLosses(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-[color:var(--color-accent,#16A34A)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent,#16A34A)]/20"
            />
          </div>
          <div className="flex flex-col justify-end gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={heldMoreThanYear}
                onChange={(e) => setHeldMoreThanYear(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-[color:var(--color-accent,#16A34A)] focus:ring-[color:var(--color-accent,#16A34A)]"
              />
              Held for more than 12 months (50% CGT discount)
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={includeMedicare}
                onChange={(e) => setIncludeMedicare(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-[color:var(--color-accent,#16A34A)] focus:ring-[color:var(--color-accent,#16A34A)]"
              />
              Include 2% Medicare levy
            </label>
          </div>
        </div>

        <div className="mt-8 rounded-xl bg-gray-50 p-6">
          {result.loss ? (
            <div className="space-y-2">
              <p className="text-2xl font-bold text-red-600">
                Capital loss: {formatCurrency(Math.abs(result.grossGain))}
              </p>
              <p className="text-sm text-gray-600">
                Losses can be used to offset future capital gains. No tax is payable.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-gray-600">Gross capital gain</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(result.grossGain)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">50% discount applied</p>
                <p className="text-2xl font-bold text-[color:var(--color-accent,#16A34A)]">
                  {formatCurrency(result.discount)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Net capital gain</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(result.netGain)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Estimated tax payable</p>
                <p className="text-2xl font-bold text-[color:var(--color-accent,#16A34A)]">
                  {formatCurrency(result.tax)}
                </p>
                <p className="text-xs text-gray-500">
                  {(result.taxRate * 100).toFixed(0)}% effective rate on net gain
                </p>
              </div>
            </div>
          )}
        </div>

        {ctaProduct && hasUsableAffiliateUrl(ctaProduct.affiliate_url) && (
          <div className="mt-8 rounded-xl border border-[color:var(--color-accent,#16A34A)]/20 bg-[color:var(--color-accent,#16A34A)]/5 p-6">
            <div className="flex items-start gap-4">
              <ProductLogo
                name={ctaProduct.name}
                src={ctaProduct.image_url}
                alt={ctaProduct.image_alt ?? ctaProduct.name}
                size={48}
              />
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">Too many trades to input manually?</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Let {ctaProduct.name} import your exchange and wallet history, apply the 12-month
                  discount, and generate an ATO-ready tax report in minutes.
                </p>
              </div>
              <a
                href={getTrackingUrl(
                  ctaProduct.slug,
                  "cgt-calculator",
                  ctaProduct.affiliate_url,
                  hasConsent,
                )}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="shrink-0 rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: "var(--color-accent, #16A34A)" }}
              >
                {ctaProduct.cta_text || `Try ${ctaProduct.name} free`}
              </a>
            </div>
          </div>
        )}

        <p className="mt-6 text-xs text-gray-500">
          This is a simplified estimator for individuals using 2024–25 Australian resident tax
          rates. It does not include the temporary budget repair levy, HECS/HELP, offsets or your
          actual marginal rate including capital gains. Verify with a registered tax agent or the
          ATO.
        </p>
      </div>
    </div>
  );
}
