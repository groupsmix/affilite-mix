import type { ContentRow } from "@/types/database";
import Link from "next/link";
import { highlightText } from "./highlight-text";
import { formatCardDate } from "@/lib/format-card-date";
import { ContentCardImage } from "./content-card-client";

interface ContentCardProps {
  content: ContentRow;
  locale?: string;
  /** Optional search query to highlight matching terms */
  searchQuery?: string;
  /** Mark as above-the-fold for LCP optimisation */
  priority?: boolean;
  /** Category slug used for a distinct fallback icon when no featured image is set */
  categorySlug?: string;
  /** Flat variant removes shadow/raise so the card recedes behind primary CTAs */
  variant?: "default" | "flat";
}

export function ContentCard({
  content,
  locale = "en-US",
  searchQuery,
  priority = false,
  categorySlug,
  variant = "default",
}: ContentCardProps) {
  const href = `/${content.type}/${content.slug}`;
  const flat = variant === "flat";

  return (
    <article
      className={`group flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground transition-all ${
        flat ? "shadow-none hover:shadow-none" : "shadow-sm hover:-translate-y-0.5 hover:shadow-md"
      }`}
    >
      <ContentCardImage
        href={href}
        src={content.featured_image}
        alt={content.title}
        type={content.type}
        categorySlug={categorySlug}
        priority={priority}
      />
      <div className="flex flex-1 flex-col p-5">
        <Link href={href}>
          <h3 className="mb-2 text-lg font-bold leading-snug tracking-tight transition-colors group-hover:[color:var(--color-accent-text,#15803D)]">
            {searchQuery ? highlightText(content.title, searchQuery) : content.title}
          </h3>
        </Link>
        {content.excerpt && (
          <p className="mb-4 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {searchQuery ? highlightText(content.excerpt, searchQuery) : content.excerpt}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span className="rounded-full bg-muted px-2 py-0.5 uppercase tracking-wider">
            {content.type}
          </span>
          {(content.publish_at ?? content.created_at) && (
            <time dateTime={content.publish_at ?? content.created_at}>
              {formatCardDate(content.publish_at ?? content.created_at, locale)}
            </time>
          )}
        </div>
      </div>
    </article>
  );
}
