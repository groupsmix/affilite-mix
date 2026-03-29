"use client";

import { useState, useCallback } from "react";
import { TurnstileWidget } from "@/app/admin/components/turnstile-widget";

interface NewsletterSignupProps {
  siteLanguage?: string;
}

export function NewsletterSignup({ siteLanguage = "en" }: NewsletterSignupProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
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

      setStatus("success");
      setEmail("");
    } catch {
      setErrorMsg(isAr ? "حدث خطأ. حاول مرة أخرى." : "Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center">
        <p className="text-lg font-medium text-emerald-800">
          {isAr ? "تم الاشتراك بنجاح!" : "You're subscribed!"}
        </p>
        <p className="mt-1 text-sm text-emerald-600">
          {isAr
            ? "شكراً لاشتراكك. ستصلك أحدث المقالات والعروض."
            : "Thanks for subscribing. You'll receive our latest articles and deals."}
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
          onToken={handleTurnstileToken}
          onExpire={handleTurnstileExpire}
        />
      </form>
      {status === "error" && errorMsg && (
        <p className="mt-2 text-xs text-red-500">{errorMsg}</p>
      )}
    </div>
  );
}
