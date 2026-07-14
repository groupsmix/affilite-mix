"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Search } from "lucide-react";
import type { SiteDefinition } from "@/config/site-definition";
import type { ProductRow, CategoryRow } from "@/types/database";

interface ShowcaseHeroProps {
  site: SiteDefinition;
  featuredProducts: ProductRow[];
  categories: Pick<CategoryRow, "id" | "name">[];
  productCount: number;
  reviewCount: number;
}

export function ShowcaseHero({
  site,
  featuredProducts,
  categories,
  productCount,
  reviewCount,
}: ShowcaseHeroProps) {
  const [imgError, setImgError] = useState(false);

  const heroImage = useMemo(
    () => site.brand.heroImage || featuredProducts[0]?.image_url,
    [site.brand.heroImage, featuredProducts],
  );

  const stats = [
    { value: productCount, label: site.productLabelPlural },
    { value: reviewCount, label: "In-depth reviews" },
    { value: categories.length, label: "Categories" },
    { value: 0, label: "Sponsored picks" },
  ];

  const hasGiftFinder = site.features.giftFinder;

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden">
      {/* Background image or gradient */}
      {heroImage && !imgError ? (
        <>
          <Image
            src={heroImage}
            alt={site.name}
            fill
            priority
            className="object-cover"
            sizes="100vw"
            onError={() => setImgError(true)}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 92%, transparent), color-mix(in srgb, var(--color-primary) 72%, transparent))",
            }}
          />
        </>
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at top, var(--color-accent-light), transparent 60%), var(--color-primary)`,
            opacity: 0.12,
          }}
        />
      )}

      {/* Content */}
      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 py-32 md:py-40">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-3xl"
        >
          <p className="text-xs uppercase tracking-[0.4em] text-accent">{site.brand.niche}</p>
          <h1 className="mt-4 font-heading text-5xl text-foreground md:text-7xl lg:text-8xl">
            {site.name}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">
            {site.brand.description}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="#collection"
              className="inline-flex items-center justify-center rounded-lg px-6 py-3 text-sm font-medium text-[var(--color-accent-text-foreground)] transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--color-accent-text)" }}
            >
              Browse {site.productLabelPlural}
            </Link>
            <Link
              href="/review"
              className="inline-flex items-center justify-center rounded-lg border border-white/20 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-white/10"
            >
              Read reviews
            </Link>
            {hasGiftFinder && (
              <Link
                href="/gift-finder"
                className="inline-flex items-center justify-center rounded-lg border border-white/20 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-white/10"
              >
                Gift Finder
              </Link>
            )}
            <Link
              href="/search"
              aria-label="Search"
              className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Search className="h-5 w-5" aria-hidden="true" />
            </Link>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="mt-16 grid grid-cols-2 gap-px border border-white/10 bg-white/5 md:grid-cols-4"
        >
          {stats.map((stat) => (
            <div key={stat.label} className="p-6 text-center">
              <p className="font-heading text-3xl text-white md:text-4xl">{stat.value}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.2em] text-white/60">{stat.label}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
