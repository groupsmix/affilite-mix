export default function AdminAdsLoading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse">
      <div className="mb-6 flex items-center justify-between">
        <div className="h-8 w-40 rounded bg-gray-200" />
        <div className="h-9 w-32 rounded-md bg-gray-200" />
      </div>

      {/* Ad placements list skeleton */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
          <div className="flex gap-8">
            <div className="h-4 w-24 rounded bg-gray-200" />
            <div className="h-4 w-20 rounded bg-gray-200" />
            <div className="h-4 w-16 rounded bg-gray-200" />
            <div className="h-4 w-16 rounded bg-gray-200" />
          </div>
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-8 border-b border-gray-100 px-4 py-3">
            <div className="h-4 w-32 rounded bg-gray-200" />
            <div className="h-4 w-20 rounded bg-gray-100" />
            <div className="h-4 w-16 rounded bg-gray-100" />
            <div className="h-4 w-16 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
