export default function AdminAnalyticsLoading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse">
      <div className="mb-2 h-8 w-32 rounded bg-gray-200" />
      <div className="mb-8 h-4 w-56 rounded bg-gray-100" />

      {/* Summary cards skeleton */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="mb-2 h-4 w-20 rounded bg-gray-200" />
            <div className="h-9 w-16 rounded bg-gray-200" />
          </div>
        ))}
      </div>

      {/* Revenue & CTR skeleton */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="mb-2 h-4 w-28 rounded bg-gray-200" />
            <div className="mb-1 h-9 w-20 rounded bg-gray-200" />
            <div className="h-3 w-24 rounded bg-gray-100" />
          </div>
        ))}
      </div>

      {/* Funnel skeleton */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <div className="mb-4 h-6 w-48 rounded bg-gray-200" />
        <div className="flex items-center gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex-1 text-center">
              <div className="mx-auto mb-2 h-2 rounded-full bg-gray-200" style={{ width: `${100 - i * 20}%` }} />
              <div className="mx-auto mb-1 h-6 w-12 rounded bg-gray-200" />
              <div className="mx-auto h-3 w-20 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      </div>

      {/* Chart skeleton */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <div className="mb-4 h-6 w-52 rounded bg-gray-200" />
        <div className="h-48 w-full rounded bg-gray-100" />
      </div>

      {/* Tables skeleton */}
      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="mb-4 h-6 w-40 rounded bg-gray-200" />
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} className="flex items-center justify-between">
                  <div className="h-4 w-32 rounded bg-gray-100" />
                  <div className="h-4 w-16 rounded bg-gray-100" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
