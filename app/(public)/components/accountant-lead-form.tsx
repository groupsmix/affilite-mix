"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fetchWithCsrf } from "@/lib/fetch-csrf";

interface AccountantLeadFormProps {
  siteName: string;
}

const SITUATIONS = [
  "Capital gains from trading",
  "DeFi / yield / staking",
  "NFTs",
  "Airdrops",
  "ATO review / audit",
  "Multiple years to amend",
  "Just need a quote",
];

const STATES = [
  "New South Wales",
  "Victoria",
  "Queensland",
  "Western Australia",
  "South Australia",
  "Tasmania",
  "Australian Capital Territory",
  "Northern Territory",
];

export function AccountantLeadForm({ siteName }: AccountantLeadFormProps) {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitForm(form: HTMLFormElement) {
    setLoading(true);
    setError(null);

    const formData = new FormData(form);
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "")
      .trim()
      .toLowerCase();
    const phone = String(formData.get("phone") ?? "").trim();
    const state = String(formData.get("state") ?? "");
    const transactionVolume = String(formData.get("transactionVolume") ?? "");
    const message = String(formData.get("message") ?? "").trim();
    const situations = formData.getAll("situations").map(String);

    const bodyMessage = [
      `Accountant referral request from ${siteName}`,
      "",
      `Name: ${name || "Not provided"}`,
      `Email: ${email}`,
      `Phone: ${phone || "Not provided"}`,
      `State/Territory: ${state || "Not provided"}`,
      `Tax situation: ${situations.length ? situations.join(", ") : "Not specified"}`,
      `Estimated transaction volume: ${transactionVolume || "Not provided"}`,
      "",
      "Message:",
      message || "No additional message",
    ].join("\n");

    try {
      const res = await fetchWithCsrf("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          subject: "Accountant referral request",
          message: bodyMessage,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Something went wrong. Please try again.");
      }

      setSubmitted(true);
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send request.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-emerald-800">
        <h3 className="mb-2 text-lg font-semibold">Request received</h3>
        <p>
          Thanks for reaching out. We will review your situation and introduce you to a
          crypto-specialist registered tax agent who fits your needs.
        </p>
      </div>
    );
  }

  return (
    <form
      id="lead-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submitForm(e.currentTarget);
      }}
      className="space-y-5"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="lead-name">Name</Label>
          <Input id="lead-name" name="name" type="text" placeholder="Your name" maxLength={128} />
        </div>

        <div>
          <Label htmlFor="lead-email">
            Email <span className="text-red-500">*</span>
          </Label>
          <Input
            id="lead-email"
            name="email"
            type="email"
            placeholder="you@example.com"
            required
            maxLength={256}
          />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="lead-phone">Phone</Label>
          <Input
            id="lead-phone"
            name="phone"
            type="tel"
            placeholder="04XX XXX XXX"
            maxLength={64}
          />
        </div>

        <div>
          <Label htmlFor="lead-state">State / Territory</Label>
          <select
            id="lead-state"
            name="state"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Select your state</option>
            {STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <Label>What do you need help with?</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {SITUATIONS.map((situation) => (
            <label
              key={situation}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-sm transition-colors hover:bg-gray-50"
            >
              <input
                type="checkbox"
                name="situations"
                value={situation}
                className="size-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              {situation}
            </label>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor="lead-volume">Estimated transaction volume</Label>
        <select
          id="lead-volume"
          name="transactionVolume"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          <option value="">Select an option</option>
          <option value="Under 50 transactions">Under 50 transactions</option>
          <option value="50–200 transactions">50–200 transactions</option>
          <option value="200–1,000 transactions">200–1,000 transactions</option>
          <option value="1,000+ transactions">1,000+ transactions</option>
        </select>
      </div>

      <div>
        <Label htmlFor="lead-message">Tell us about your situation</Label>
        <Textarea
          id="lead-message"
          name="message"
          placeholder="E.g. I traded on multiple exchanges, did some DeFi yield farming, and received an airdrop. I need help preparing my 2025 tax return."
          rows={4}
          maxLength={4000}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button
        type="submit"
        disabled={loading}
        className="w-full bg-slate-900 text-white hover:bg-slate-800 sm:w-auto"
      >
        {loading ? "Sending..." : "Request an accountant match"}
      </Button>
    </form>
  );
}
