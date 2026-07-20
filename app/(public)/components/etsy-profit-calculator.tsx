"use client";

import { useMemo, useState, useEffect } from "react";
import { useCookieConsent } from "./cookie-consent";
import { ProductCardCta } from "./product-card-client";
import { NewsletterSignup } from "./newsletter-signup";

interface EtsyProfitCalculatorProps {
  siteLanguage?: string;
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function percentOrZero(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function EtsyProfitCalculator({ siteLanguage = "en" }: EtsyProfitCalculatorProps) {
  const [salePrice, setSalePrice] = useState<string>("15.00");
  const [itemCost, setItemCost] = useState<string>("5.00");
  const [listingFee, setListingFee] = useState<string>("0.20");
  const [transactionFeePercent, setTransactionFeePercent] = useState<string>("6.5");
  const [processingFeePercent, setProcessingFeePercent] = useState<string>("3");
  const [processingFeeFixed, setProcessingFeeFixed] = useState<string>("0.25");
  const [monthlyOverhead, setMonthlyOverhead] = useState<string>("0");
  const [monthlySales, setMonthlySales] = useState<string>("50");
  const [showEmailGate, setShowEmailGate] = useState<boolean>(false);
  useCookieConsent();

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "gtag" in window &&
      typeof (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag === "function"
    ) {
      (window as unknown as { gtag: (...args: unknown[]) => void }).gtag(
        "event",
        "calculator_use",
        {
          event_category: "engagement",
          event_label: "etsy-profit-calculator",
        },
      );
    }
  }, []);

  const result = useMemo(() => {
    const price = percentOrZero(salePrice);
    const cost = percentOrZero(itemCost);
    const listFee = percentOrZero(listingFee);
    const txPct = percentOrZero(transactionFeePercent) / 100;
    const procPct = percentOrZero(processingFeePercent) / 100;
    const procFixed = percentOrZero(processingFeeFixed);
    const overhead = percentOrZero(monthlyOverhead);
    const sales = Math.floor(percentOrZero(monthlySales));

    const transactionFee = price * txPct;
    const processingFee = price * procPct + procFixed;
    const feesPerUnit = listFee + transactionFee + processingFee;
    const profitPerUnit = price - cost - feesPerUnit;
    const margin = price > 0 ? (profitPerUnit / price) * 100 : 0;

    const monthlyRevenue = price * sales;
    const monthlyVariableCosts = (cost + feesPerUnit) * sales;
    const monthlyProfit = monthlyRevenue - monthlyVariableCosts - overhead;

    let breakEvenUnits = 0;
    if (profitPerUnit > 0 && overhead > 0) {
      breakEvenUnits = Math.ceil(overhead / profitPerUnit);
    } else if (profitPerUnit > 0 && overhead === 0) {
      breakEvenUnits = 1;
    }

    // Recommend a tool based on inputs (text-only; affiliate links added by product cards below)
    let recommendation: string;
    if (sales < 20 && price - cost < 5) {
      recommendation =
        "Your margin is tight. Focus on product research to find better-priced opportunities before scaling.";
    } else if (sales < 30) {
      recommendation =
        "You are still validating demand. A product-research tool helps you find proven listings before investing in design.";
    } else if (sales >= 30 && price - cost >= 5) {
      recommendation =
        "You have margin to scale. An SEO and listing-automation tool can help you expand titles, tags, and listings faster.";
    } else {
      recommendation =
        "Revisit your cost or price inputs; the current numbers produce a slim margin.";
    }

    return {
      price,
      cost,
      listFee,
      transactionFee,
      processingFee,
      feesPerUnit,
      profitPerUnit,
      margin,
      sales,
      monthlyRevenue,
      monthlyVariableCosts,
      monthlyProfit,
      overhead,
      breakEvenUnits,
      recommendation,
    };
  }, [
    salePrice,
    itemCost,
    listingFee,
    transactionFeePercent,
    processingFeePercent,
    processingFeeFixed,
    monthlyOverhead,
    monthlySales,
  ]);

  const recommendTool = useMemo(() => {
    if (result.sales < 30) {
      return {
        slug: "everbee",
        name: "EverBee",
        href: "https://everbee.io",
        description: "Find proven Etsy products and analyze competitor listings before you design.",
        cta: "Explore EverBee",
        reason: "Best for research and validation",
      };
    }
    return {
      slug: "alura",
      name: "Alura",
      href: "https://alura.io",
      description: "Optimize titles, tags, and listings with marketplace data + AI suggestions.",
      cta: "Explore Alura",
      reason: "Best for scaling listings",
    };
  }, [result.sales]);

  const designTool = useMemo(
    () => ({
      slug: "kittl",
      name: "Kittl",
      href: "https://kittl.com",
      description: "Create POD designs, mockups, and variations with AI-assisted templates.",
      cta: "Explore Kittl",
    }),
    [],
  );

  return (
    <div className="mx-auto max-w-5xl">
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Inputs */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8 lg:col-span-2">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label htmlFor="salePrice" className="block text-sm font-medium text-gray-700">
                Sale price (USD)
              </label>
              <input
                id="salePrice"
                type="number"
                min="0"
                step="0.01"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-[color:var(--color-accent,#2D6BF0)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent,#2D6BF0)]/20"
              />
            </div>
            <div>
              <label htmlFor="itemCost" className="block text-sm font-medium text-gray-700">
                Item cost (blank/POD/digital)
              </label>
              <input
                id="itemCost"
                type="number"
                min="0"
                step="0.01"
                value={itemCost}
                onChange={(e) => setItemCost(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-[color:var(--color-accent,#2D6BF0)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent,#2D6BF0)]/20"
              />
            </div>
            <div>
              <label htmlFor="listingFee" className="block text-sm font-medium text-gray-700">
                Etsy listing fee
              </label>
              <input
                id="listingFee"
                type="number"
                min="0"
                step="0.01"
                value={listingFee}
                onChange={(e) => setListingFee(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-[color:var(--color-accent,#2D6BF0)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent,#2D6BF0)]/20"
              />
            </div>
            <div>
              <label htmlFor="transactionFee" className="block text-sm font-medium text-gray-700">
                Etsy transaction fee (%)
              </label>
              <input
                id="transactionFee"
                type="number"
                min="0"
                step="0.1"
                value={transactionFeePercent}
                onChange={(e) => setTransactionFeePercent(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-[color:var(--color-accent,#2D6BF0)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent,#2D6BF0)]/20"
              />
            </div>
            <div>
              <label
                htmlFor="processingPercent"
                className="block text-sm font-medium text-gray-700"
              >
                Payment processing (%)
              </label>
              <input
                id="processingPercent"
                type="number"
                min="0"
                step="0.1"
                value={processingFeePercent}
                onChange={(e) => setProcessingFeePercent(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-[color:var(--color-accent,#2D6BF0)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent,#2D6BF0)]/20"
              />
            </div>
            <div>
              <label htmlFor="processingFixed" className="block text-sm font-medium text-gray-700">
                Payment processing fixed fee
              </label>
              <input
                id="processingFixed"
                type="number"
                min="0"
                step="0.01"
                value={processingFeeFixed}
                onChange={(e) => setProcessingFeeFixed(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-[color:var(--color-accent,#2D6BF0)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent,#2D6BF0)]/20"
              />
            </div>
            <div>
              <label htmlFor="monthlyOverhead" className="block text-sm font-medium text-gray-700">
                Monthly overhead (optional)
              </label>
              <input
                id="monthlyOverhead"
                type="number"
                min="0"
                step="0.01"
                value={monthlyOverhead}
                onChange={(e) => setMonthlyOverhead(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-[color:var(--color-accent,#2D6BF0)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent,#2D6BF0)]/20"
              />
            </div>
            <div>
              <label htmlFor="monthlySales" className="block text-sm font-medium text-gray-700">
                Estimated monthly sales
              </label>
              <input
                id="monthlySales"
                type="number"
                min="0"
                step="1"
                value={monthlySales}
                onChange={(e) => setMonthlySales(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-[color:var(--color-accent,#2D6BF0)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent,#2D6BF0)]/20"
              />
            </div>
          </div>

          <p className="mt-6 text-xs text-gray-500">
            Fee defaults are based on Etsys published US seller fees as of July 2026. Always verify
            current fees on{" "}
            <a
              href="https://www.etsy.com/legal/fees/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              style={{ color: "var(--color-accent-text, var(--color-accent))" }}
            >
              Etsy&apos;s Fees & Payments Policy
            </a>{" "}
            or{" "}
            <a
              href="https://help.etsy.com/hc/en-us/articles/360035902374-Etsy-Fee-Basics"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              style={{ color: "var(--color-accent-text, var(--color-accent))" }}
            >
              Etsy Fee Basics
            </a>
            .
          </p>
        </div>

        {/* Results */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
            <h3 className="text-lg font-semibold text-gray-900">Per unit</h3>
            <div className="mt-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Fees</span>
                <span className="font-medium tabular-nums">
                  {formatCurrency(result.feesPerUnit)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Profit</span>
                <span
                  className="font-medium tabular-nums"
                  style={{ color: result.profitPerUnit >= 0 ? "#059669" : "#DC2626" }}
                >
                  {formatCurrency(result.profitPerUnit)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Margin</span>
                <span className="font-medium tabular-nums">{result.margin.toFixed(1)}%</span>
              </div>
            </div>

            <h3 className="mt-8 text-lg font-semibold text-gray-900">Monthly estimate</h3>
            <div className="mt-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Revenue</span>
                <span className="font-medium tabular-nums">
                  {formatCurrency(result.monthlyRevenue)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Variable costs</span>
                <span className="font-medium tabular-nums">
                  {formatCurrency(result.monthlyVariableCosts)}
                </span>
              </div>
              {result.overhead > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Overhead</span>
                  <span className="font-medium tabular-nums">
                    {formatCurrency(result.overhead)}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-t border-gray-100 pt-3 text-base font-semibold">
                <span className="text-gray-900">Profit</span>
                <span
                  className="tabular-nums"
                  style={{ color: result.monthlyProfit >= 0 ? "#059669" : "#DC2626" }}
                >
                  {formatCurrency(result.monthlyProfit)}
                </span>
              </div>
              {result.breakEvenUnits > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Break-even units</span>
                  <span className="font-medium tabular-nums">{result.breakEvenUnits}</span>
                </div>
              )}
            </div>
          </div>

          {/* Tool recommendation */}
          <div
            className="rounded-2xl border p-6"
            style={{
              borderColor: "var(--color-accent, #2D6BF0)",
              backgroundColor: "rgba(45,107,240,0.05)",
            }}
          >
            <p
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--color-accent-text, var(--color-accent))" }}
            >
              Suggested next step
            </p>
            <p className="mt-2 text-sm text-gray-700">{result.recommendation}</p>

            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-gray-900">{recommendTool.name}</h4>
                    <p className="mt-1 text-sm text-gray-600">{recommendTool.description}</p>
                  </div>
                </div>
                <ProductCardCta
                  href={recommendTool.href}
                  slug={recommendTool.slug}
                  sourceType="etsy-profit-calculator"
                  placement="calculator-result"
                  campaign="etsy-profit-calculator"
                  label={recommendTool.cta}
                  className="mt-3 inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ backgroundColor: "var(--color-accent, #2D6BF0)" }}
                />
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-gray-900">{designTool.name}</h4>
                    <p className="mt-1 text-sm text-gray-600">{designTool.description}</p>
                  </div>
                </div>
                <ProductCardCta
                  href={designTool.href}
                  slug={designTool.slug}
                  sourceType="etsy-profit-calculator"
                  placement="calculator-result"
                  campaign="etsy-profit-calculator"
                  label={designTool.cta}
                  className="mt-3 inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ backgroundColor: "var(--color-accent, #2D6BF0)" }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Email gate */}
      <div className="mt-10 rounded-2xl border border-gray-200 bg-white p-6 sm:p-8">
        {!showEmailGate ? (
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Get the full cost worksheet</h3>
              <p className="mt-1 text-sm text-gray-600">
                A downloadable spreadsheet with these formulas, fee inputs, and a monthly profit
                tracker.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowEmailGate(true)}
              className="inline-flex items-center rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--color-accent, #2D6BF0)" }}
            >
              Send me the worksheet
            </button>
          </div>
        ) : (
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Send the worksheet to my inbox</h3>
            <p className="mt-1 text-sm text-gray-600">
              You&apos;ll also get the Etsy AI Workflow Checklist.
            </p>
            <div className="mt-4 max-w-xl">
              <NewsletterSignup siteLanguage={siteLanguage} />
            </div>
          </div>
        )}
      </div>

      <p className="mt-6 text-xs text-gray-500">
        This calculator is an estimator. It does not account for Etsy Ads, Offsite Ads, shipping,
        taxes, currency conversion, or regional fee differences. Verify your actual fees in your
        Etsy Payment account.
      </p>
    </div>
  );
}
