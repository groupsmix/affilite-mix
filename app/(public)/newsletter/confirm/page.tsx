import { getCurrentSite } from "@/lib/site-context";
import { getServiceClient } from "@/lib/supabase-server";
import { captureException } from "@/lib/sentry";
import type { Metadata } from "next";
import Link from "next/link";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  const isAr = site.language === "ar";
  return {
    title: `${isAr ? "تأكيد الاشتراك" : "Confirm Subscription"} — ${site.name}`,
  };
}

type ConfirmResult =
  | { status: "success" }
  | { status: "already_confirmed" }
  | { status: "error"; code: "missing_token" | "invalid_token" | "update_failed" | "unknown" };

async function confirmSubscription(token: string | undefined): Promise<ConfirmResult> {
  if (!token) {
    return { status: "error", code: "missing_token" };
  }

  try {
    const sb = getServiceClient();

    const { data: subscriber, error: fetchError } = await sb
      .from("newsletter_subscribers")
      .select("id, status, confirmed_at")
      .eq("confirmation_token", token)
      .single();

    if (fetchError || !subscriber) {
      captureException(fetchError ?? new Error("Token not found"), {
        context: "newsletter-confirm",
        token,
      });
      return { status: "error", code: "invalid_token" };
    }

    if (subscriber.status === "active" && subscriber.confirmed_at) {
      return { status: "already_confirmed" };
    }

    const { error: updateError } = await sb
      .from("newsletter_subscribers")
      .update({
        status: "active",
        confirmed_at: new Date().toISOString(),
        confirmation_token: null,
      })
      .eq("id", subscriber.id);

    if (updateError) {
      captureException(updateError, {
        context: "newsletter-confirm",
        subscriberId: subscriber.id,
      });
      return { status: "error", code: "update_failed" };
    }

    return { status: "success" };
  } catch (err) {
    captureException(err, { context: "newsletter-confirm" });
    return { status: "error", code: "unknown" };
  }
}

export default async function NewsletterConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const site = await getCurrentSite();
  const isAr = site.language === "ar";
  const params = await searchParams;
  const result = await confirmSubscription(params.token);

  const isSuccess = result.status === "success" || result.status === "already_confirmed";

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      {isSuccess ? (
        <>
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="mb-3 text-2xl font-bold text-gray-900">
            {isAr ? "تم تأكيد اشتراكك!" : "Subscription Confirmed!"}
          </h1>
          <p className="mb-6 text-gray-600">
            {isAr
              ? `شكراً لاشتراكك في النشرة البريدية لـ ${site.name}. ستصلك أحدث المقالات والعروض مباشرة إلى بريدك الإلكتروني.`
              : `Thank you for subscribing to the ${site.name} newsletter. You\u2019ll receive the latest articles and updates directly in your inbox.`}
          </p>
        </>
      ) : (
        <>
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="mb-3 text-2xl font-bold text-gray-900">
            {isAr ? "فشل التأكيد" : "Confirmation Failed"}
          </h1>
          <p className="mb-6 text-gray-600">
            {isAr
              ? "تعذّر تأكيد اشتراكك. قد يكون الرابط غير صالح أو منتهي الصلاحية."
              : "We couldn\u2019t confirm your subscription. The link may be invalid or expired."}
          </p>
        </>
      )}
      <Link
        href="/"
        className="inline-block rounded-md px-6 py-3 text-sm font-medium text-white transition-colors"
        style={{ backgroundColor: "var(--color-primary, #111827)" }}
      >
        {isAr ? "العودة إلى الصفحة الرئيسية" : "Back to Homepage"}
      </Link>
    </div>
  );
}
