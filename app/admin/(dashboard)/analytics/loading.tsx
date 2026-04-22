import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminAnalyticsLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl">
      {/* Header skeleton */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-64" />
      </div>

      {/* KPI row skeleton */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="gap-3 py-5">
            <CardHeader className="px-5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2 h-8 w-20" />
            </CardHeader>
            <CardContent className="px-5">
              <Skeleton className="h-3 w-36" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart skeleton */}
      <Card className="mb-6">
        <CardHeader>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="mt-1 h-3 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-60 w-full" />
        </CardContent>
      </Card>

      {/* Two-up tables skeleton */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} className="flex items-center justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent clicks skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-36" />
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
