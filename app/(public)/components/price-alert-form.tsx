"use client";

import { useState, type FormEvent } from "react";

interface PriceAlertFormProps {
  productId: string;
  productName: string;
  currentPrice?: number;
  currency?: string;
}

/**
 * "Notify me when this drops below $X" form.
 * Captures email + target price → creates a price-drop alert subscription.
 * This is the highest-converting email capture UX on product pages.
 */
export function PriceAlertForm({
  productId,
  productName,
  currentPrice,
  currency = "USD",
}: PriceAlertFormProps) {
  const [email, setEmail] = useState("");
  const [targetPrice, setTargetPrice] = useState(currentPrice ? Math.round(currentPrice * 0.9) : 0);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email || !targetPrice) return;

    setStatus("loading");
    try {
      const res = await fetch(`/api/products/${productId}/price-alert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, target_price: targetPrice, currency }),
      });
      const data = await res.json();

      if (res.ok) {
        setStatus("success");
        setMessage(data.message || "Price alert created!");
      } else {
        setStatus("error");
        setMessage(data.error || "Something went wrong");
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
        <p className="font-medium">Alert set!</p>
        <p className="mt-1">
          We&apos;ll email you at <strong>{email}</strong> when <strong>{productName}</strong> drops
          below{" "}
          <strong>
            {new Intl.NumberFormat("en-US", { style: "currency", currency }).format(targetPrice)}
          </strong>
          .
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="space-y-3 rounded-lg border bg-gray-50 p-4"
    >
      <p className="text-sm font-medium text-gray-700">Get notified when the price drops</p>

      <div className="flex gap-2">
        <input
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
            $
          </span>
          <input
            type="number"
            min={1}
            step={1}
            value={targetPrice || ""}
            onChange={(e) => setTargetPrice(Number(e.target.value))}
            required
            placeholder="Target"
            className="w-28 rounded-md border border-gray-300 py-2 pl-7 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
      >
        {status === "loading" ? "Setting alert..." : "Set Price Alert"}
      </button>

      {status === "error" && <p className="text-xs text-red-600">{message}</p>}

      <p className="text-xs text-gray-400">Free. No spam. Unsubscribe anytime.</p>
    </form>
  );
}
