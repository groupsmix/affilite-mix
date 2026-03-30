"use client";

import { useState, useCallback } from "react";
import TurnstileWidget from "@/app/(public)/components/turnstile-widget";

interface NewsletterSignupProps {
  siteLanguage?: string;
}

export function NewsletterSignup({ siteLanguage = "en" }: NewsletterSignupProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const isAr = siteLanguage === "ar";

  const handleTurnstileToken = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken(null);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, turnstileToken }),
      });

      if (!res.ok) {
        const data = await res.json();
        setErrorMsg(data.error ?? (isAr ? "فشل الاشتراك" : "Failed to subscribe"));
        setStatus("error");
        return;
      }

      const data = await res.json();
      setSuccessMsg(
        data.message ??
          (isAr
            ? "يرجى التحقق من بريدك الإلكتروني لتأكيد اشتراكك."
            : "Almost there! Check your inbox and click the confirmation link to complete your subscription.")
      );
      setStatus("success");
      setEmail("");
    } catch {
      setErrorMsg(isAr ? "حدث خطأ. حاول مرة أخرى." : "Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center" role="status" aria-live="polite">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
          <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
        </div>
        <p className="text-lg font-medium text-amber-800">
          {isAr ? "تحقق من بريدك الإلكتروني" : "Check your inbox"}
        </p>
        <p className="mt-1 text-sm text-amber-700">
          {successMsg}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-6">
      <h3 className="mb-2 text-lg font-semibold text-gray-900">
        {isAr ? "اشترك في النشرة البريدية" : "Subscribe to our newsletter"}
      </h3>
      <p className="mb-4 text-sm text-gray-600">
        {isAr
          ? "احصل على أحدث المراجعات والعروض الحصرية مباشرة في بريدك."
          : "Get the latest reviews and exclusive deals delivered to your inbox."}
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={isAr ? "بريدك الإلكتروني" : "your@email.com"}
            required
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <button
            type="submit"
            disabled={status === "loading"}
            className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {status === "loading"
              ? (isAr ? "جاري..." : "...")
              : (isAr ? "اشترك" : "Subscribe")}
          </button>
        </div>
        <TurnstileWidget
          onVerify={handleTurnstileToken}
          onExpire={handleTurnstileExpire}
        />
      </form>
      {status === "error" && errorMsg && (
        <p className="mt-2 text-xs text-red-500" role="alert" aria-live="assertive">{errorMsg}</p>
      )}
    </div>
  );
}
