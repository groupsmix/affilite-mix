import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { SiteDefinition } from "@/config/site-definition";
import { calmPosts, calmProducts } from "@/lib/calmroutine";
import { CalmShell } from "./shell";
import { BreathingHero } from "./breathing-hero";
import { CalmPostCard } from "./post-card";
import { CalmProductCard } from "./product-card";
import { CalmNewsletterStrip } from "./newsletter-strip";

export function CalmHomepage({ site }: { site: SiteDefinition }) {
  const latest = calmPosts.slice(0, 3);
  const featuredTools = calmProducts.slice(0, 3);

  return (
    <CalmShell site={site}>
      <BreathingHero />

      {/* Pillar-page callout */}
      <div className="mx-auto max-w-5xl px-6">
        <Link
          href="/reset-nervous-system"
          className="group flex flex-col gap-3 rounded-xl border border-border-subtle bg-card p-8 transition-colors hover:border-accent-mid sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="max-w-xl">
            <p className="text-xs font-medium tracking-wide text-accent-mid">Start here</p>
            <h2 className="mt-2 font-serif text-2xl text-text-primary text-balance">
              The complete guide to resetting your nervous system
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
              Everything in one place — what a reset actually is, the breath and movement that help,
              and the routines to build from here.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm font-medium text-accent-dark">
            Read the guide
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </span>
        </Link>
      </div>

      {/* Latest posts */}
      <section className="mx-auto max-w-5xl px-6 pt-20">
        <div className="flex items-end justify-between">
          <h2 className="font-serif text-3xl text-text-primary">Latest routines &amp; practices</h2>
          <Link
            href="/category/reset-routines"
            className="hidden text-sm text-text-secondary hover:text-accent-dark sm:inline"
          >
            Browse all
          </Link>
        </div>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {latest.map((post) => (
            <CalmPostCard key={post.slug} post={post} />
          ))}
        </div>
      </section>

      {/* Recommended tools teaser (affiliate path) */}
      <section className="mx-auto max-w-5xl px-6 pt-20">
        <div className="flex items-end justify-between">
          <div className="max-w-xl">
            <h2 className="font-serif text-3xl text-text-primary">Tools worth trying</h2>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
              Tested-first picks with honest notes. Nothing here I haven&apos;t used myself.
            </p>
          </div>
          <Link
            href="/tools"
            className="hidden whitespace-nowrap text-sm text-text-secondary hover:text-accent-dark sm:inline"
          >
            See all tools
          </Link>
        </div>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featuredTools.map((product) => (
            <CalmProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pt-20">
        <CalmNewsletterStrip />
      </section>
    </CalmShell>
  );
}
