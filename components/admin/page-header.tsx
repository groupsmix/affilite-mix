// Layout patterns adapted from https://github.com/Qualiora/shadboard (MIT).
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Reusable page header for admin routes. Not yet adopted — available for
 * migration alongside other shadcn primitives.
 *
 * Example:
 *   <PageHeader
 *     title="Content"
 *     description="All articles for the active site."
 *     actions={<Button>New article</Button>}
 *   />
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
