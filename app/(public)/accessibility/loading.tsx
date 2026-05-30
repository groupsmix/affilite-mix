export default function Loading() {
  return (
    <div
      className="mx-auto max-w-4xl px-4 py-12 animate-pulse"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading...</span>
      <div className="mb-6 h-8 w-2/3 rounded bg-gray-200" />
      <div className="space-y-3">
        <div className="h-4 w-full rounded bg-gray-200" />
        <div className="h-4 w-5/6 rounded bg-gray-200" />
        <div className="h-4 w-4/5 rounded bg-gray-200" />
      </div>
    </div>
  );
}
