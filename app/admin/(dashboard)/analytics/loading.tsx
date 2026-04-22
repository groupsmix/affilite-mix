import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

function KpiSkeleton() {
  return (
    <Card className="gap-3 py-5">
      <CardHeader className="px-5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-3 w-32" />
      </CardHeader>
    </Card>
  );
}

function ListCardSkeleton() {
  return (
    <Card className="gap-4">
      <CardHeader>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-52" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton className="h-5 w-8 rounded-full" />
              <Skeleton className="size-10 rounded-md" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-40 max-w-full" />
                <Skeleton className="h-3 w-24" />
              </div>
              <div className="space-y-2 text-right">
                <Skeleton className="ml-auto h-4 w-14" />
                <Skeleton className="ml-auto h-3 w-10" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TableCardSkeleton() {
  return (
    <Card className="gap-4 lg:col-span-2">
      <CardHeader>
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <div className="border-b px-4 py-3">
            <div className="grid grid-cols-4 gap-4">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>
          <div className="space-y-0">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="grid grid-cols-4 gap-4 border-b px-4 py-3 last:border-b-0"
              >
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-full max-w-[180px]" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminAnalyticsLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-9 w-[170px]" />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <KpiSkeleton key={index} />
        ))}
      </div>

      <div className="mb-6">
        <Card className="gap-4">
          <CardHeader>
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-28" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[280px] w-full rounded-lg" />
          </CardContent>
        </Card>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <ListCardSkeleton />
        <ListCardSkeleton />
        <ListCardSkeleton />
        <TableCardSkeleton />
      </div>
    </div>
  );
}
