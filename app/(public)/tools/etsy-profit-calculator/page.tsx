import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentSite } from "@/lib/site-context";
import { EtsyProfitCalculator } from "../../components/etsy-profit-calculator";
import {
  JsonLd,
  organizationJsonLd,
  softwareApplicationJsonLd,
  faqJsonLd,
} from "../../components/json-ld";
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  if (site.slug !== "ai-compared") {
    return { title: "Not Found" };
  }
  const title = "Free Etsy Profit & Break-Even Calculator (2026)";
  const description =
    "Estimate Etsy fees, profit per sale, monthly profit, and break-even units. Built for print-on-demand and digital-product sellers using official Etsy fee data.";
  return {
    metadataBase: new URL(`https://${site.domain}`),
    title,
    description,
    alternates: { canonical: `https://${site.domain}/tools/etsy-profit-calculator` },
    openGraph: {
      title,
      description,
      url: `https://${site.domain}/tools/etsy-profit-calculator`,
      siteName: site.name,
      locale: site.locale,
      type: "website",
    },
  };
}

const calculatorFaq = [
  {
    question: "What Etsy fees does this calculator include?",
    answer:
      "It includes the listing fee, the transaction fee, and a payment processing fee. It does not include optional costs such as Etsy Ads, Offsite Ads, shipping, taxes, or currency conversion.",
  },
  {
    question: "How is break-even calculated?",
    answer:
      "Break-even units equals your monthly overhead divided by profit per unit. If you have no overhead, the calculator shows a single unit as the baseline.",
  },
  {
    question: "Can I use this for digital products?",
    answer:
      "Yes. Set item cost to your production cost per unit (for example, design time or asset license cost). For digital items the per-unit production cost is often near zero.",
  },
];

const faqHtml = calculatorFaq
  .map(({ question, answer }) => `<h3>${question}</h3><p>${answer}</p>`)
  .join("");

export default async function EtsyProfitCalculatorPage() {
  const site = await getCurrentSite();
  if (site.slug !== "ai-compared") {
    notFound();
  }

  const orgJsonLd = organizationJsonLd(site);
  const appJsonLd = softwareApplicationJsonLd({
    name: "CompareAI Etsy Profit Calculator",
    description:
      "A free calculator that estimates Etsy fees, profit per sale, and break-even units for POD and digital-product sellers.",
    url: `https://${site.domain}/tools/etsy-profit-calculator`,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Any",
  });
  const faqJson = faqJsonLd(faqHtml);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <div className="mb-8 text-center sm:mb-12">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Free Etsy Profit & Break-Even Calculator
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
          Estimate your real Etsy fees, profit per sale, and break-even units before you publish a
          listing. Built for print-on-demand and digital-product sellers.
        </p>
      </div>

      <EtsyProfitCalculator siteLanguage={site.language} />

      <JsonLd data={orgJsonLd} />
      <JsonLd data={appJsonLd} />
      {faqJson && <JsonLd data={faqJson} />}
    </main>
  );
}
