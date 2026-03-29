export default function AdminContentLoading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse">
      <div className="mb-6 flex items-center justify-between">
        <div className="h-8 w-28 rounded bg-gray-200" />
        <div className="h-9 w-28 rounded-md bg-gray-200" />
      </div>

      {/* Status filter tabs skeleton */}
      <div className="mb-4 flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-7 w-20 rounded-full bg-gray-200" />
        ))}
      </div>

      {/* Content list skeleton */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-6 border-b border-gray-100 px-4 py-3">
            <div className="h-4 w-48 rounded bg-gray-200" />
            <div className="h-4 w-16 rounded bg-gray-100" />
            <div className="h-4 w-20 rounded bg-gray-100" />
            <div className="h-4 w-24 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
