export default function GiftFinderLoading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 animate-pulse">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 h-8 w-64 rounded bg-gray-200" />
        <div className="mx-auto h-4 w-48 rounded bg-gray-200" />
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-8">
        <div className="mb-4 h-6 w-48 rounded bg-gray-200" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg border border-gray-200 bg-gray-50" />
          ))}
        </div>
      </div>
    </div>
  );
}
