// Card composition patterns adapted from https://github.com/Qualiora/shadboard (MIT).
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listContent } from "@/lib/dal/content";

import { RelativeTime } from "./relative-time";

interface ScheduledContentCardProps {
  siteId: string;
  /** How many upcoming rows to show. Defaults to 5. */
  limit?: number;
}

export async function ScheduledContentCard({ siteId, limit = 5 }: ScheduledContentCardProps) {
  const scheduled = await listContent({ siteId, status: "scheduled" });
  const now = Date.now();

  const upcoming = scheduled
    .filter((c) => c.publish_at && new Date(c.publish_at).getTime() > now)
    .sort(
      (a, b) =>
        new Date(a.publish_at as string).getTime() - new Date(b.publish_at as string).getTime(),
    )
    .slice(0, limit);

  return (
    <Card className="gap-4" data-slot="scheduled-content-card">
      <CardHeader>
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base">Scheduled content</CardTitle>
          <CardDescription>
            {upcoming.length === 0
              ? "Nothing queued to publish."
              : `Next ${upcoming.length} item${upcoming.length === 1 ? "" : "s"} to go live.`}
          </CardDescription>
        </div>
        <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
          <Link
            href="/admin/content?status=scheduled"
            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            View all
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">All caught up.</p>
        ) : (
          <ul className="divide-y divide-border">
            {upcoming.map((c) => {
              const publishAt = c.publish_at as string;
              const absolute = new Date(publishAt).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });
              return (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <Link
                    href={`/admin/content/${c.id}`}
                    className="truncate text-sm font-medium text-foreground hover:underline"
                  >
                    {c.title}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    <RelativeTime iso={publishAt} absoluteFallback={absolute} />
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
