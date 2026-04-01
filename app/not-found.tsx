import { getCurrentSite } from "@/lib/site-context";
import Link from "next/link";

/**
 * Root 404 page — shown for routes outside the (public) and admin groups.
 * Attempts to detect language and apply the site's accent color for branding.
 * Falls back to English + neutral gray when the site context is unavailable
 * (e.g. during static generation).
 */
export default async function NotFound() {
  let isAr = false;
  let siteName = "";
  try {
    const site = await getCurrentSite();
    isAr = site.language === "ar";
    siteName = site.name;
  } catch {
    // Site context unavailable (build-time or middleware didn't run)
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1
          className="text-8xl font-bold"
          style={{ color: "color-mix(in srgb, var(--color-primary, #1E293B) 20%, transparent)" }}
        >
          404
        </h1>
        <h2 className="mt-4 text-2xl font-bold text-gray-900">
          {isAr ? "الصفحة غير موجودة" : "Page not found"}
        </h2>
        <p className="mt-2 text-gray-500">
          {isAr
            ? "عذرًا، الصفحة التي تبحث عنها غير موجودة أو تم نقلها."
            : "Sorry, the page you\u2019re looking for doesn\u2019t exist or has been moved."}
        </p>
        {siteName && <p className="mt-1 text-sm text-gray-500">{siteName}</p>}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center rounded-xl px-6 py-3 text-sm font-semibold text-white transition-all duration-300 hover:opacity-90"
            style={{ backgroundColor: "var(--color-accent, #10B981)" }}
          >
            {isAr ? "العودة للرئيسية" : "Go to Homepage"}
          </Link>
          <Link
            href="/search"
            className="inline-flex min-h-[44px] items-center rounded-xl border border-gray-300 px-6 py-3 text-sm font-semibold text-gray-700 transition-all duration-300 hover:bg-gray-50"
          >
            {isAr ? "البحث" : "Search"}
          </Link>
        </div>
      </div>
    </div>
  );
}
