export default function AdminDashboardLoading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse">
      <div className="mb-2 h-8 w-40 rounded bg-gray-200" />
      <div className="mb-6 h-4 w-48 rounded bg-gray-100" />

      {/* Stats cards skeleton */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="mb-2 h-4 w-20 rounded bg-gray-200" />
            <div className="h-9 w-16 rounded bg-gray-200" />
          </div>
        ))}
      </div>

      {/* Quick actions skeleton */}
      <div className="mb-8">
        <div className="mb-3 h-4 w-28 rounded bg-gray-200" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-9 w-32 rounded-lg border border-gray-200 bg-white" />
          ))}
        </div>
      </div>

      {/* Bottom grid skeleton */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="mb-3 h-4 w-36 rounded bg-gray-200" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="h-4 w-32 rounded bg-gray-100" />
                <div className="h-4 w-16 rounded bg-gray-100" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <div className="mb-1 h-4 w-20 rounded bg-gray-200" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-1 h-5 w-28 rounded bg-gray-200" />
              <div className="h-4 w-40 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
