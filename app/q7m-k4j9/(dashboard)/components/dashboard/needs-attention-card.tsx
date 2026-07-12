// Actionable "work queue" for the dashboard workspace.
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { AlertTriangleIcon, CheckCircle2Icon, InfoIcon } from "./dashboard-icons";

export interface DashboardAttention {
  type: "warning" | "info";
  /** Short label for the work item, without the count. */
  message: string;
  /** How many items are in this queue. */
  count: number;
  /** Where to go to resolve the items. */
  href?: string;
}

interface NeedsAttentionCardProps {
  items: DashboardAttention[];
}

export function NeedsAttentionCard({ items }: NeedsAttentionCardProps) {
  if (items.length === 0) {
    return (
      <Card className="gap-4" data-slot="needs-attention-card">
        <CardHeader>
          <CardTitle className="text-base">Needs attention</CardTitle>
          <CardDescription>All systems nominal. Nothing to review.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2Icon className="text-emerald-600" />
            <span>All caught up.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gap-4" data-slot="needs-attention-card">
      <CardHeader>
        <CardTitle className="text-base">Needs attention</CardTitle>
        <CardDescription>Items that need your review before they go live.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {items.map((item, i) => {
          const isWarning = item.type === "warning";
          const Icon = isWarning ? AlertTriangleIcon : InfoIcon;
          const badgeClass = isWarning
            ? "bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-200"
            : "bg-sky-100 text-sky-800 hover:bg-sky-100 dark:bg-sky-900/30 dark:text-sky-200";
          return (
            <Link
              key={i}
              href={item.href ?? "#"}
              className={cn(
                "group flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors",
                isWarning
                  ? "border-amber-200 bg-amber-50/50 hover:bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20 dark:hover:bg-amber-950/30"
                  : "border-sky-200 bg-sky-50/50 hover:bg-sky-50 dark:border-sky-900/50 dark:bg-sky-950/20 dark:hover:bg-sky-950/30",
              )}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={cn("size-4 shrink-0", isWarning ? "text-amber-600" : "text-sky-600")}
                />
                <span className="text-sm font-medium text-foreground">{item.message}</span>
              </div>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center justify-center rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap tabular-nums",
                  badgeClass,
                )}
              >
                {item.count}
              </span>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
