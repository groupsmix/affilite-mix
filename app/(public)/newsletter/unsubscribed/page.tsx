import { getCurrentSite } from "@/lib/site-context";
import { resolveDbSiteBySlug } from "@/lib/dal/site-resolver";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ResubscribeForm } from "./resubscribe-form";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  const isAr = site.language === "ar";
  return {
    title: `${isAr ? "تم إلغاء الاشتراك" : "Unsubscribed"} — ${site.name}`,
  };
}

export default async function NewsletterUnsubscribedPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const site = await getCurrentSite();
  const isAr = site.language === "ar";
  const params = await searchParams;
  const hasError = !!params.error;

  // Fetch site logo and DB site ID for branding + re-subscribe
  let logoUrl: string | null = null;
  let dbSiteId: string | null = null;
  try {
    const dbSite = await resolveDbSiteBySlug(site.id);
    if (dbSite) {
      logoUrl = dbSite.logo_url ?? null;
      dbSiteId = dbSite.id;
    }
  } catch {
    // Fallback to config logo
  }
  const siteLogo = logoUrl || site.brand.logo;

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      {/* Site logo branding */}
      {siteLogo && (
        <div className="mx-auto mb-8">
          <Image
            src={siteLogo}
            alt={site.name}
            width={160}
            height={48}
            sizes="160px"
            className="mx-auto h-12 w-auto"
            priority
          />
        </div>
      )}

      {hasError ? (
        <>
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <svg
              className="h-8 w-8 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <h1 className="mb-3 text-2xl font-bold text-gray-900">
            {isAr ? "فشل إلغاء الاشتراك" : "Unsubscribe Failed"}
          </h1>
          <p className="mb-6 text-gray-600">
            {isAr
              ? "تعذّر إلغاء اشتراكك. يرجى المحاولة مرة أخرى أو التواصل معنا."
              : "We couldn\u2019t process your unsubscribe request. Please try again or contact us."}
          </p>
        </>
      ) : (
        <>
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100">
            <svg
              className="h-8 w-8 text-yellow-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h1 className="mb-3 text-2xl font-bold text-gray-900">
            {isAr ? "تم إلغاء اشتراكك" : "You\u2019ve Been Unsubscribed"}
          </h1>
          <p className="mb-6 text-gray-600">
            {isAr
              ? `تم إلغاء اشتراكك من النشرة البريدية لـ ${site.name}. لن تتلقى أي رسائل بريدية أخرى منا.`
              : `You\u2019ve been unsubscribed from the ${site.name} newsletter. You won\u2019t receive any more emails from us.`}
          </p>

          {/* Re-subscribe form */}
          <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-5">
            <p className="mb-3 text-sm font-medium text-gray-700">
              {isAr
                ? "هل قمت بإلغاء الاشتراك بالخطأ؟ أعد الاشتراك أدناه:"
                : "Unsubscribed by mistake? Re-subscribe below:"}
            </p>
            <ResubscribeForm siteId={dbSiteId ?? ""} siteName={site.name} isAr={isAr} />
          </div>
        </>
      )}
      <Link
        href="/"
        className="inline-block rounded-md px-6 py-3 text-sm font-medium text-white transition-colors"
        style={{ backgroundColor: "var(--color-primary, #111827)" }}
      >
        {isAr ? "العودة إلى الصفحة الرئيسية" : "Back to Homepage"}
      </Link>

      {/* Site name footer branding */}
      <p className="mt-8 text-xs text-gray-400">
        &copy; {new Date().getFullYear()} {site.name}
      </p>
    </div>
  );
}
