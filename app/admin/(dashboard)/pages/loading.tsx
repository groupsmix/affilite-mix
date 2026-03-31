export default function PagesLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div>
        <div className="h-8 w-36 rounded bg-gray-200" />
        <div className="mt-2 h-4 w-72 rounded bg-gray-100" />
      </div>

      {/* Page list skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <div className="h-4 w-32 rounded bg-gray-200" />
              <div className="h-4 w-16 rounded bg-gray-100" />
            </div>
            <div className="flex gap-2">
              <div className="h-8 w-16 rounded bg-gray-100" />
              <div className="h-8 w-16 rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
