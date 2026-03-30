"use client";

import { useState } from "react";
import type { ContentRow } from "@/types/database";
import Link from "next/link";
import Image from "next/image";
import { shimmerPlaceholder } from "@/lib/image-placeholder";

interface ContentCardProps {
  content: ContentRow;
  locale?: string;
}

export function ContentCard({ content, locale = "en-US" }: ContentCardProps) {
  const href = `/${content.type}/${content.slug}`;
  const [imgError, setImgError] = useState(false);

  return (
    <article className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      {content.featured_image && !imgError && (
        <Link href={href}>
          <Image
            src={content.featured_image}
            alt={content.title}
            width={400}
            height={176}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            placeholder="blur"
            blurDataURL={shimmerPlaceholder(400, 176)}
            className="h-44 w-full object-cover"
            onError={() => setImgError(true)}
          />
        </Link>
      )}
      <div className="p-5">
        <Link href={href}>
          <h3 className="mb-2 text-xl font-semibold leading-tight transition-colors hover:[color:var(--color-accent,#10B981)]">
            {content.title}
          </h3>
        </Link>
        {content.excerpt && (
          <p className="mb-3 line-clamp-2 text-sm text-gray-600">{content.excerpt}</p>
        )}
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>{content.type}</span>
          {(content.publish_at ?? content.created_at) && (
            <time dateTime={content.publish_at ?? content.created_at}>
              {new Date(content.publish_at ?? content.created_at).toLocaleDateString(locale)}
            </time>
          )}
        </div>
      </div>
    </article>
  );
}
