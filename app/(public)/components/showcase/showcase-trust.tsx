import Link from "next/link";
import type { SiteDefinition } from "@/config/site-definition";
import { ScrollReveal } from "./showcase-ui";

interface ShowcaseTrustProps {
  site: SiteDefinition;
  productCount: number;
  reviewCount: number;
  categoryCount: number;
}

export function ShowcaseTrust({
  site,
  productCount,
  reviewCount,
  categoryCount,
}: ShowcaseTrustProps) {
  const stats = [
    { value: productCount, label: site.productLabelPlural },
    { value: reviewCount, label: "In-depth reviews" },
    { value: categoryCount, label: "Categories" },
    { value: 0, label: "Sponsored picks" },
  ];

  return (
    <section className="w-full border-y border-border bg-card py-20 md:py-32">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-20">
          <ScrollReveal>
            <p className="text-xs uppercase tracking-[0.4em] text-accent">Why {site.name}</p>
            <h2 className="mt-4 font-heading text-4xl text-balance text-foreground md:text-5xl">
              The <span className="italic">friend</span> who actually knows{" "}
              {site.productLabelPlural.toLowerCase()}
            </h2>
            <div className="mt-6 space-y-4 leading-relaxed text-muted-foreground">
              <p>{site.brand.description}</p>
              <p>{site.affiliateDisclosure}</p>
            </div>
            {site.features.giftFinder && (
              <Link
                href="/gift-finder"
                className="mt-8 inline-flex items-center justify-center rounded-lg border border-accent/50 px-6 py-3 text-sm font-medium text-accent transition-colors hover:bg-[var(--color-accent-text)] hover:text-[var(--color-accent-text-foreground)]"
              >
                Open the Gift Finder
              </Link>
            )}
          </ScrollReveal>

          <ScrollReveal delay={150}>
            <dl className="grid grid-cols-2 gap-px border border-border bg-border">
              {stats.map((stat) => (
                <div key={stat.label} className="bg-background p-6 text-center md:p-8">
                  <dd className="font-heading text-3xl text-accent md:text-4xl">{stat.value}</dd>
                  <dt className="mt-2 text-xs uppercase tracking-[0.2em] text-muted-foreground text-pretty">
                    {stat.label}
                  </dt>
                </div>
              ))}
            </dl>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
