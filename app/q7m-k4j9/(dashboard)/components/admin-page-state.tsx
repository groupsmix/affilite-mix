import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { logger } from "@/lib/logger";

export function AdminDataError({
  title = "Some dashboard data could not load",
  description = "The page is still available, but one or more database queries failed. Try again after the database or migration issue is fixed.",
  retryHref,
}: {
  title?: string;
  description?: string;
  retryHref?: string;
}) {
  return (
    <Card className="border-amber-200 bg-amber-50/70">
      <CardContent className="py-6 text-center">
        <h2 className="text-base font-semibold text-amber-950">{title}</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-amber-900 dark:text-amber-200">
          {description}
        </p>
        <div className="mt-4 flex justify-center gap-3">
          {retryHref ? (
            <Link
              href={retryHref}
              className="rounded-md bg-amber-900 px-4 py-2 text-sm font-medium text-white dark:text-gray-900 hover:bg-amber-950"
            >
              Retry
            </Link>
          ) : null}
          <Link
            href="/q7m-k4j9/sites"
            className="rounded-md border border-amber-300 bg-white dark:bg-gray-900 px-4 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100"
          >
            Check active site
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export async function safeAdminData<T>(
  label: string,
  loader: () => Promise<T>,
  fallback: T,
): Promise<{ data: T; error: string | null }> {
  try {
    return { data: await loader(), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[admin-page] ${label} failed`, { error: message });
    return { data: fallback, error: message };
  }
}
