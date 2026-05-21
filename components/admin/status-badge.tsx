"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Generic color-mapped badge for admin tables.
 *
 * Callers pass a `colorMap` of status/action key -> Tailwind class string so
 * existing per-table color semantics are preserved exactly (greens, yellows,
 * reds, etc.). Unknown keys fall back to the neutral `fallbackClassName`.
 *
 * Use this for content status, product status, audit-log actions, and any
 * similar badge where the only per-page difference is the color map.
 */
export interface StatusBadgeProps {
  /** The label to display (also used to look up the color). */
  status: string;
  /** Map of lowercased status key -> className (e.g. "bg-green-100 text-green-700 ..."). */
  colorMap: Record<string, string>;
  /** Fallback class when `status` has no entry in `colorMap`. */
  fallbackClassName?: string;
  /** Extra classes appended after the color classes. Defaults to `capitalize`. */
  className?: string;
  /** Match a key by substring in addition to exact match. Used by the audit log where
   *  action names look like `content.created`. Defaults to `false`. */
  matchSubstring?: boolean;
}

function resolveColorClass(
  status: string,
  colorMap: Record<string, string>,
  matchSubstring: boolean,
  fallbackClassName: string,
): string {
  const key = status.toLowerCase();
  if (colorMap[key]) return colorMap[key];
  if (matchSubstring) {
    for (const [name, cls] of Object.entries(colorMap)) {
      if (key.includes(name)) return cls;
    }
  }
  return fallbackClassName;
}

export function StatusBadge({
  status,
  colorMap,
  fallbackClassName = "",
  className = "capitalize",
  matchSubstring = false,
}: StatusBadgeProps) {
  const colorClass = resolveColorClass(status, colorMap, matchSubstring, fallbackClassName);
  return (
    <Badge variant="secondary" className={cn(className, colorClass)}>
      {status}
    </Badge>
  );
}
