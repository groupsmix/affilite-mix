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
}

export function ContentCard({
  content,
  locale = "en-US",
  searchQuery,
  priority = false,
}: ContentCardProps) {
  const href = `/${content.type}/${content.slug}`;

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <ContentCardImage
        href={href}
        src={content.featured_image}
        alt={content.title}
        title={content.title}
        type={content.type}
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
