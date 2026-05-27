export default function MediaKitLoading() {
  return (
    <div
      className="mx-auto max-w-4xl px-4 py-12 animate-pulse"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading...</span>
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 h-8 w-48 rounded bg-gray-200" />
        <div className="mx-auto h-4 w-80 rounded bg-gray-200" />
      </div>
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="mb-3 h-6 w-40 rounded bg-gray-200" />
            <div className="space-y-2">
              <div className="h-4 w-full rounded bg-gray-100" />
              <div className="h-4 w-3/4 rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
