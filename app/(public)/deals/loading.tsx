export default function DealsLoading() {
  return (
    <div
      className="mx-auto max-w-6xl px-4 py-12 animate-pulse"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading...</span>
      <div className="mb-8">
        <div className="mb-3 h-8 w-48 rounded bg-gray-200" />
        <div className="h-4 w-80 rounded bg-gray-200" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="mb-3 h-5 w-16 rounded-full bg-red-100" />
            <div className="mb-2 h-5 w-40 rounded bg-gray-200" />
            <div className="mb-3 h-4 w-full rounded bg-gray-100" />
            <div className="h-8 w-24 rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
