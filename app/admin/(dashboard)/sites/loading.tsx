export default function AdminSitesLoading() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse">
      <div className="mb-6 h-8 w-36 rounded bg-gray-200" />
      <div className="mb-6 h-4 w-64 rounded bg-gray-100" />

      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="mb-2 h-6 w-32 rounded bg-gray-200" />
            <div className="mb-1 h-4 w-40 rounded bg-gray-100" />
            <div className="h-4 w-24 rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
