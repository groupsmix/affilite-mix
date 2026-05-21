"use client";

import { useState } from "react";
import { fetchWithCsrf } from "@/lib/fetch-csrf";

interface ResubscribeFormProps {
  siteId: string;
  siteName: string;
  isAr: boolean;
}

export function ResubscribeForm({ siteId, siteName, isAr }: ResubscribeFormProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !siteId) return;

    setStatus("loading");
    setMessage("");

    try {
      const res = await fetchWithCsrf("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), site_id: siteId }),
      });

      const data = await res.json();

      if (res.ok) {
        setStatus("success");
        setMessage(
          isAr
            ? `تم إعادة اشتراكك في ${siteName}! يرجى التحقق من بريدك الإلكتروني للتأكيد.`
            : (data.message ??
                `You've been re-subscribed to ${siteName}! Please check your email to confirm.`),
        );
        setEmail("");
      } else {
        setStatus("error");
        setMessage(
          isAr
            ? "تعذّرت إعادة الاشتراك. يرجى المحاولة لاحقاً."
            : (data.error ?? "Failed to re-subscribe. Please try again later."),
        );
      }
    } catch {
      setStatus("error");
      setMessage(
        isAr ? "حدث خطأ. يرجى المحاولة لاحقاً." : "An error occurred. Please try again later.",
      );
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-md bg-green-50 p-3">
        <p className="text-sm font-medium text-green-700">{message}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
      className="flex gap-2"
    >
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={isAr ? "أدخل بريدك الإلكتروني" : "Enter your email"}
        required
        dir={isAr ? "rtl" : "ltr"}
        className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <button
        type="submit"
        disabled={status === "loading"}
        className="whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
        style={{ backgroundColor: "var(--color-primary, #111827)" }}
      >
        {status === "loading"
          ? isAr
            ? "جارٍ..."
            : "Sending..."
          : isAr
            ? "إعادة الاشتراك"
            : "Re-subscribe"}
      </button>
      {status === "error" && <p className="mt-2 text-xs text-red-600">{message}</p>}
    </form>
  );
}
