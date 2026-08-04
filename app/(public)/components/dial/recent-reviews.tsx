import Link from "next/link";
import type { ContentRow } from "@/types/database";
import { ContentCard } from "../content-card";

interface RecentReviewsProps {
  content: ContentRow[];
  locale?: string;
}

export function RecentReviews({ content, locale = "en-US" }: RecentReviewsProps) {
  const items = content.slice(0, 3);
  if (items.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
      <div className="mb-10 flex items-end justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
            Latest
          </p>
          <h2 className="mt-3 font-serif text-2xl font-semibold tracking-tight md:text-3xl">
            Latest from WristNerd
          </h2>
        </div>
        <Link
          href="/blog"
          className="hidden text-sm font-medium text-foreground underline underline-offset-[6px] transition-colors hover:text-primary sm:block"
        >
          See all &rarr;
        </Link>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((c) => (
          <ContentCard key={c.id} content={c} locale={locale} />
        ))}
      </div>
    </section>
  );
}
