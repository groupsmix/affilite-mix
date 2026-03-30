"use client";

import { useState } from "react";

interface ExpandableTableProps {
  children: React.ReactNode;
  /** Number of rows to show when collapsed */
  initialRows?: number;
  totalRows: number;
}

/**
 * Wraps a <tbody> and shows a "Show more / Show less" toggle
 * when there are more rows than `initialRows`.
 */
export function ExpandableTable({
  children,
  initialRows = 5,
  totalRows,
}: ExpandableTableProps) {
  const [expanded, setExpanded] = useState(false);

  const needsToggle = totalRows > initialRows;

  return (
    <>
      <tbody>
        {expanded
          ? children
          : Array.isArray(children)
            ? children.slice(0, initialRows)
            : children}
      </tbody>
      {needsToggle && (
        <tfoot>
          <tr>
            <td colSpan={100} className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="text-xs font-medium text-gray-500 hover:text-gray-700"
              >
                {expanded
                  ? "Show less"
                  : `Show all ${totalRows} rows`}
              </button>
            </td>
          </tr>
        </tfoot>
      )}
    </>
  );
}
