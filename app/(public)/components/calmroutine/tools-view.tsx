import Link from "next/link";
import { getCalmProductsByCategory, type CalmSiteConfig } from "@/lib/calm-config";
import { CalmProductCard } from "./product-card";

export function CalmToolsPage({ config }: { config: CalmSiteConfig }) {
  return (
    <>
      <header className="max-w-2xl">
        <p className="text-sm font-medium text-accent-mid">Recommended tools</p>
        <h1 className="mt-2 font-serif text-4xl leading-tight text-text-primary text-balance">
          The picks, without the article
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-text-secondary text-pretty">
          For when you already trust the site and just want to browse. Everything here has been
          tested first. Higher-ticket devices link to a full review before they link out — I would
          rather you read before you buy.
        </p>
      </header>

      <div className="mt-14 flex flex-col gap-16">
        {config.productGroups.map((group) => {
          const items = getCalmProductsByCategory(config, group.category);
          return (
            <section key={group.category} aria-labelledby={`group-${group.category}`}>
              <div className="max-w-xl">
                <h2
                  id={`group-${group.category}`}
                  className="font-serif text-2xl text-text-primary"
                >
                  {group.name}
                </h2>
                <p className="mt-2 leading-relaxed text-text-secondary">{group.intro}</p>
              </div>
              <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((product) => (
                  <CalmProductCard key={product.id} product={product} />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-16 rounded-xl border border-border-subtle bg-accent-tint/40 p-6 text-sm leading-relaxed text-text-secondary">
        Some links on this page are affiliate links. If you buy through them, we may earn a small
        commission at no extra cost to you. It never changes what we recommend — read our{" "}
        <Link
          href="/affiliate-disclosure"
          className="text-accent-dark underline underline-offset-2"
        >
          affiliate disclosure
        </Link>
        .
      </p>
    </>
  );
}
