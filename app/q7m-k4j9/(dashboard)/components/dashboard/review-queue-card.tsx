// Pending-review queue for the dashboard workspace.
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listContent, countContent } from "@/lib/dal/content";
import { logger } from "@/lib/logger";

import { RelativeTime } from "./relative-time";

interface ReviewQueueCardProps {
  siteId: string;
  /** Total pending count. When provided, the card skips the count query and only loads the list. */
  count?: number;
  /** How many rows to list. Defaults to 5. */
  limit?: number;
}

export async function ReviewQueueCard({ siteId, count, limit = 5 }: ReviewQueueCardProps) {
  let pending: Awaited<ReturnType<typeof listContent>> = [];
  let total = count ?? 0;

  try {
    if (count === undefined) {
      [pending, total] = await Promise.all([
        listContent({ siteId, status: "review", limit }),
        countContent({ siteId, status: "review" }),
      ]);
    } else if (count > 0) {
      pending = await listContent({ siteId, status: "review", limit });
    }
  } catch (error: unknown) {
    logger.warn("[dashboard] review queue unavailable", {
      siteId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return (
    <Card className="gap-4" data-slot="review-queue-card">
      <CardHeader>
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base">Pending review</CardTitle>
          <CardDescription>
            {total === 0
              ? "Nothing is waiting for review."
              : `${total} item${total === 1 ? "" : "s"} waiting for review.`}
          </CardDescription>
        </div>
        <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
          <Link
            href="/q7m-k4j9/content?f.status=review"
            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            View all
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">All caught up.</p>
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((item) => {
              const updatedAt = item.updated_at;
              const absolute = new Date(updatedAt).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });
              return (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <Link
                    href={`/q7m-k4j9/content/${item.id}`}
                    className="truncate text-sm font-medium text-foreground hover:underline"
                  >
                    {item.title}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    <RelativeTime iso={updatedAt} absoluteFallback={absolute} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
