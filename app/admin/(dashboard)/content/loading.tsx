export default function AdminContentLoading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse">
      <div className="mb-6 flex items-center justify-between">
        <div className="h-8 w-28 rounded bg-gray-200" />
        <div className="h-9 w-28 rounded-md bg-gray-200" />
      </div>

      {/* Bulk actions bar skeleton */}
      <div className="mb-2 h-9 w-48 rounded bg-gray-100" />

      {/* Status filter tabs skeleton */}
      <div className="mb-4 flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-7 w-20 rounded-full bg-gray-200" />
        ))}
      </div>

      {/* Card layout skeleton (mobile) */}
      <div className="mt-4 grid gap-3 md:hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded bg-gray-200" />
                <div className="h-4 w-40 rounded bg-gray-200" />
              </div>
              <div className="h-5 w-16 rounded-full bg-gray-200" />
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="h-5 w-14 rounded bg-gray-100" />
              <div className="h-3 w-16 rounded bg-gray-100" />
            </div>
            <div className="flex gap-3">
              <div className="h-4 w-10 rounded bg-gray-100" />
              <div className="h-4 w-12 rounded bg-gray-100" />
              <div className="h-4 w-14 rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>

      {/* Table layout skeleton (md+) */}
      <div className="mt-4 hidden overflow-hidden rounded-lg border border-gray-200 bg-white md:block">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
          <div className="flex gap-8">
            <div className="h-4 w-4 rounded bg-gray-200" />
            <div className="h-4 w-24 rounded bg-gray-200" />
            <div className="h-4 w-16 rounded bg-gray-200" />
            <div className="h-4 w-16 rounded bg-gray-200" />
            <div className="h-4 w-20 rounded bg-gray-200" />
            <div className="h-4 w-16 rounded bg-gray-200" />
          </div>
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-8 border-b border-gray-100 px-4 py-3">
            <div className="h-4 w-4 rounded bg-gray-200" />
            <div className="h-4 w-48 rounded bg-gray-200" />
            <div className="h-4 w-16 rounded bg-gray-100" />
            <div className="h-5 w-16 rounded-full bg-gray-100" />
            <div className="h-4 w-24 rounded bg-gray-100" />
            <div className="flex gap-2">
              <div className="h-4 w-10 rounded bg-gray-100" />
              <div className="h-4 w-12 rounded bg-gray-100" />
              <div className="h-4 w-14 rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
