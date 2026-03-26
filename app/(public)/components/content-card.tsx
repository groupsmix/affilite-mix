import type { ContentRow } from "@/types/database";
import Link from "next/link";

interface ContentCardProps {
  content: ContentRow;
  locale?: string;
}

export function ContentCard({ content, locale = "en-US" }: ContentCardProps) {
  const href = `/${content.type}/${content.slug}`;

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <Link href={href}>
        <h3 className="mb-2 text-xl font-semibold leading-tight hover:text-emerald-600">
          {content.title}
        </h3>
      </Link>
      {content.excerpt && (
        <p className="mb-3 line-clamp-2 text-sm text-gray-600">{content.excerpt}</p>
      )}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{content.type}</span>
        {content.updated_at && (
          <time dateTime={content.updated_at}>
            {new Date(content.updated_at).toLocaleDateString(locale)}
          </time>
        )}
      </div>
    </article>
  );
}
