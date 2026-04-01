"use client";

import { useState } from "react";
import type { ContentRow } from "@/types/database";
import Link from "next/link";
import Image from "next/image";
import { shimmerPlaceholder } from "@/lib/image-placeholder";
import { highlightText } from "./highlight-text";

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
  const [imgError, setImgError] = useState(false);

  return (
    <article className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      {content.featured_image && (
        <Link href={href}>
          {imgError ? (
            <div className="flex h-44 w-full items-center justify-center bg-gray-100 text-gray-400">
              <svg
                className="h-10 w-10"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z"
                />
              </svg>
            </div>
          ) : (
            <Image
              src={content.featured_image}
              alt=""
              width={400}
              height={176}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              placeholder="blur"
              blurDataURL={shimmerPlaceholder(400, 176)}
              className="h-44 w-full object-cover"
              priority={priority}
              onError={() => setImgError(true)}
            />
          )}
        </Link>
      )}
      <div className="p-5">
        <Link href={href}>
          <h3 className="mb-2 text-xl font-semibold leading-tight transition-colors hover:[color:var(--color-accent,#10B981)]">
            {searchQuery ? highlightText(content.title, searchQuery) : content.title}
          </h3>
        </Link>
        {content.excerpt && (
          <p className="mb-3 line-clamp-2 text-sm text-gray-600">
            {searchQuery ? highlightText(content.excerpt, searchQuery) : content.excerpt}
          </p>
        )}
        <div className="flex items-center justify-between text-xs text-gray-500">
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
