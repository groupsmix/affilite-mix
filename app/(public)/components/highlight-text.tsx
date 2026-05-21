"use client";

import type { ReactNode } from "react";

/**
 * Wraps substrings matching `query` in <mark> tags for visual highlighting.
 * Returns the original text unchanged when query is empty.
 */
export function highlightText(text: string, query: string): ReactNode {
  if (!query) return text;

  // Escape special regex characters in the query
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);

  if (parts.length === 1) return text;

  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-yellow-200 text-inherit">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}
