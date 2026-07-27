"use client";

import { useState, Children } from "react";

interface ExpandableTableProps {
  /** Total rows available */
  rows: number;
  /** How many rows to show initially */
  initialLimit?: number;
  /** List items (or any child nodes) to render; only the first `initialLimit` are shown until expanded. */
  children: React.ReactNode;
}

/**
 * Wraps a list of children with a "View all" / "Show less" toggle
 * when the number of rows exceeds the initial limit.
 */
export function ExpandableTable({ rows, initialLimit = 10, children }: ExpandableTableProps) {
  const [expanded, setExpanded] = useState(false);
  const limit = expanded ? rows : initialLimit;
  const allChildren = Children.toArray(children);
  const visibleChildren = allChildren.slice(0, limit);

  return (
    <>
      <ul className="divide-y divide-border">{visibleChildren}</ul>
      {rows > initialLimit && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-3 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
        >
          {expanded ? "Show less" : `View all ${rows} rows`}
        </button>
      )}
    </>
  );
}
