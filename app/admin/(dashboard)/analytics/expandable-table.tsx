"use client";

import { useState } from "react";

interface ExpandableTableProps {
  /** Total rows available */
  rows: number;
  /** How many rows to show initially */
  initialLimit?: number;
  children: (limit: number) => React.ReactNode;
}

/**
 * Wraps a table section with a "View all" / "Show less" toggle
 * when the number of rows exceeds the initial limit.
 */
export function ExpandableTable({ rows, initialLimit = 10, children }: ExpandableTableProps) {
  const [expanded, setExpanded] = useState(false);
  const limit = expanded ? rows : initialLimit;

  return (
    <>
      {children(limit)}
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
