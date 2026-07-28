// Card composition patterns adapted from https://github.com/Qualiora/shadboard (MIT).
import type { ReactNode } from "react";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiDelta {
  /** Percentage change vs. the previous comparable window (e.g. -12, 4.5). */
  valuePct: number;
  /** Human label that describes the comparison window (e.g. "vs prev 7d"). */
  label: string;
}

interface KpiSubLink {
  href: string;
  label: string;
  /** Warning-styled links are used for alertable metrics (e.g. missing URLs). */
  tone?: "default" | "warning";
}

export interface KpiCardProps {
  /** Short metric title (e.g. "Clicks (today)"). */
  title: string;
  /** Primary number / value rendered as a large heading. */
  value: ReactNode;
  /** Optional neutral descriptive text rendered under the value. */
  description?: ReactNode;
  /** Optional day-over-day delta badge rendered next to the value. */
  delta?: KpiDelta | null;
  /** Optional inline link row (e.g. "12 missing URL →"). */
  subLink?: KpiSubLink | null;
  /** Optional right-aligned icon / slot rendered in the header. */
  icon?: ReactNode;
  /** Optional visual slot (e.g. a sparkline) rendered under the value. */
  chart?: ReactNode;
  className?: string;
}

function formatDelta(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  if (!Number.isFinite(pct)) return "—";
  return `${sign}${pct.toFixed(pct >= 10 || pct <= -10 ? 0 : 1)}%`;
}

export function KpiCard({
  title,
  value,
  description,
  delta,
  subLink,
  icon,
  chart,
  className,
}: KpiCardProps) {
  const deltaTone =
    delta == null
      ? null
      : delta.valuePct > 0
        ? "text-emerald-600 dark:text-emerald-400"
        : delta.valuePct < 0
          ? "text-rose-600 dark:text-rose-400"
          : "text-muted-foreground";

  return (
    <Card
      className={cn(
        "group relative gap-3 overflow-hidden py-5 transition-all duration-300",
        "hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-12px_rgba(0,0,0,0.25)]",
        className,
      )}
      data-slot="kpi-card"
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100"
        style={{ backgroundColor: "var(--color-accent)" }}
      />
      <CardHeader className="px-5">
        <CardDescription className="text-xs font-medium uppercase tracking-wider">
          {title}
        </CardDescription>
        <CardTitle className="flex items-baseline gap-2 text-3xl font-semibold tracking-tight">
          <span>{value}</span>
          {delta && (
            <span className={cn("text-xs font-medium", deltaTone)} aria-label={delta.label}>
              {formatDelta(delta.valuePct)}
            </span>
          )}
        </CardTitle>
        {icon ? <div className="text-muted-foreground">{icon}</div> : null}
      </CardHeader>
      {(description || subLink || chart) && (
        <CardContent className="px-5 text-xs text-muted-foreground">
          {chart ? <div className="mb-2 -mx-0.5 h-8 w-full">{chart}</div> : null}
          {description ? <p className="leading-snug">{description}</p> : null}
          {subLink ? (
            <Link
              href={subLink.href}
              className={cn(
                "mt-1 inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline",
                subLink.tone === "warning"
                  ? "text-amber-700 dark:text-amber-300 dark:text-amber-400"
                  : "text-primary",
              )}
            >
              {subLink.label}
              <span aria-hidden>→</span>
            </Link>
          ) : null}
        </CardContent>
      )}
    </Card>
  );
}
