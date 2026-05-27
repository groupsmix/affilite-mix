export default function LandingLoading() {
  return (
    <div
      className="min-h-screen bg-[#0a0b0f] animate-pulse"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading...</span>
      <div className="mx-auto max-w-6xl px-4 py-24 text-center">
        <div className="mx-auto mb-6 h-12 w-96 max-w-full rounded bg-gray-800" />
        <div className="mx-auto mb-4 h-6 w-80 max-w-full rounded bg-gray-800/60" />
        <div className="mx-auto mt-8 h-10 w-40 rounded-lg bg-gray-800" />
      </div>
    </div>
  );
}
