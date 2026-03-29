import { getCurrentSite } from "@/lib/site-context";
import Link from "next/link";

export default async function PublicNotFound() {
  const site = await getCurrentSite();
  const isArabic = site.language === "ar";

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
      <h1
        className="text-8xl font-bold"
        style={{ color: "color-mix(in srgb, var(--color-primary, #1E293B) 20%, transparent)" }}
      >
        404
      </h1>
      <h2 className="mt-4 text-2xl font-semibold text-gray-900">
        {isArabic ? "الصفحة غير موجودة" : "Page not found"}
      </h2>
      <p className="mt-2 max-w-md text-gray-600">
        {isArabic
          ? "عذرًا، الصفحة التي تبحث عنها غير موجودة أو تم نقلها."
          : "Sorry, the page you're looking for doesn't exist or has been moved."}
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center rounded-xl px-6 py-3 text-sm font-semibold text-white transition-all duration-300 hover:opacity-90"
          style={{ backgroundColor: "var(--color-accent, #10B981)" }}
        >
          {isArabic ? "العودة للرئيسية" : "Go Home"}
        </Link>
        <Link
          href="/search"
          className="inline-flex min-h-[44px] items-center rounded-xl border border-gray-300 px-6 py-3 text-sm font-semibold text-gray-700 transition-all duration-300 hover:bg-gray-50"
        >
          {isArabic ? "البحث" : "Search"}
        </Link>
      </div>
    </div>
  );
}
