export default function AuditLogLoading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse">
      <div className="mb-2 h-8 w-32 rounded bg-gray-200" />
      <div className="mb-4 h-4 w-48 rounded bg-gray-100" />

      {/* Filter skeleton */}
      <div className="mb-4 flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-6 w-16 rounded-full bg-gray-200" />
        ))}
      </div>

      {/* Table skeleton */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
          <div className="flex gap-6">
            <div className="h-4 w-20 rounded bg-gray-200" />
            <div className="h-4 w-16 rounded bg-gray-200" />
            <div className="h-4 w-16 rounded bg-gray-200" />
            <div className="h-4 w-16 rounded bg-gray-200" />
            <div className="h-4 w-20 rounded bg-gray-200" />
          </div>
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-6 border-b border-gray-50 px-4 py-2">
            <div className="h-4 w-24 rounded bg-gray-100" />
            <div className="h-4 w-20 rounded bg-gray-100" />
            <div className="h-4 w-16 rounded bg-gray-200" />
            <div className="h-4 w-24 rounded bg-gray-100" />
            <div className="h-4 w-32 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
