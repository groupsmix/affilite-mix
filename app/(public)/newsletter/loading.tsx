export default function NewsletterLoading() {
  return (
    <div
      className="mx-auto max-w-lg px-4 py-16 text-center animate-pulse"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading...</span>
      <div className="mx-auto mb-8 h-12 w-40 rounded bg-gray-200" />
      <div className="mx-auto mb-6 h-16 w-16 rounded-full bg-gray-200" />
      <div className="mx-auto mb-3 h-7 w-64 rounded bg-gray-200" />
      <div className="mx-auto mb-6 h-4 w-80 max-w-full rounded bg-gray-200" />
      <div className="mx-auto h-10 w-48 rounded-lg bg-gray-200" />
    </div>
  );
}
