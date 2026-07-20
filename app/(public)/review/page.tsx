import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentSite } from "@/lib/site-context";
import { JsonLd, organizationJsonLd, breadcrumbJsonLd } from "../components/json-ld";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  const url = `https://${site.domain}/review`;
  return {
    metadataBase: new URL(`https://${site.domain}`),
    title: `Etsy Tool Reviews | ${site.name}`,
    description:
      "Data-first reviews and buying guides for AI-powered Etsy research, SEO, design, and POD tools. Hands-on testing notes are added after we complete real shop workflows.",
    alternates: { canonical: url },
    openGraph: {
      title: `Etsy Tool Reviews | ${site.name}`,
      description: "Data-first reviews and buying guides for Etsy tools.",
      url,
      siteName: site.name,
      locale: site.locale,
      type: "website",
    },
  };
}

const REVIEWS = [
  {
    name: "EverBee",
    focus: "Etsy product research and analytics — is it worth it for a new shop?",
    href: "/review/is-everbee-worth-it-for-new-shop",
    status: "Buying guide live",
  },
  {
    name: "Alura",
    focus: "Etsy SEO, keyword, and automation suite",
    href: null,
    status: "Awaiting hands-on testing",
  },
  {
    name: "Kittl",
    focus: "AI design and POD mockups",
    href: null,
    status: "Awaiting hands-on testing",
  },
];

export default async function ReviewHubPage() {
  const site = await getCurrentSite();
  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: "Reviews", path: "/review" },
  ]);

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: REVIEWS.filter((r) => r.href).map((r, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `https://${site.domain}${r.href}`,
      name: r.name,
    })),
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      <JsonLd data={organizationJsonLd(site)} />
      <JsonLd data={breadcrumbs} />
      <JsonLd data={itemListJsonLd} />

      <header className="mb-10 text-center sm:text-left">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Etsy tool reviews
        </h1>
        <p className="mt-4 text-lg text-gray-600">
          Data-first buying guides and hands-on reviews. Each page shows what a tool does, who it
          fits, the break-even math, and the exact use case where it earns its price.
        </p>
      </header>

      <div className="space-y-6">
        {REVIEWS.map((item) => {
          const Card = (
            <article className="rounded-2xl border border-gray-200 bg-white p-6">
              <h2 className="text-xl font-semibold text-gray-900">{item.name}</h2>
              <p className="mt-1 text-sm text-gray-600">{item.focus}</p>
              <span
                className={`mt-3 inline-flex w-fit rounded-full px-3 py-1 text-xs font-medium ${
                  item.href ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                }`}
              >
                {item.status}
              </span>
            </article>
          );
          return item.href ? (
            <Link key={item.name} href={item.href} className="group block">
              {Card}
            </Link>
          ) : (
            <div key={item.name}>{Card}</div>
          );
        })}
      </div>

      <section className="mt-12 rounded-2xl border border-gray-200 bg-white p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-gray-900">
          While we test, get the workflow that drives every review
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          A repeatable checklist: research, design, list, disclose, and promote — without guessing
          what to test next.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/tools/etsy-profit-calculator"
            className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium text-white"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            Try the free profit calculator
          </Link>
          <Link
            href="/guide"
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Read the guides
          </Link>
        </div>
      </section>
    </main>
  );
}
