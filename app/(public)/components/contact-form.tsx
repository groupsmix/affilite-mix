"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fetchWithCsrf } from "@/lib/fetch-csrf";

interface ContactFormProps {
  siteName: string;
}

export function ContactForm({ siteName }: ContactFormProps) {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitForm(form: HTMLFormElement) {
    setLoading(true);
    setError(null);

    const formData = new FormData(form);
    const payload = {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      subject: String(formData.get("subject") ?? ""),
      message: String(formData.get("message") ?? ""),
    };

    try {
      const res = await fetchWithCsrf("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Something went wrong. Please try again.");
      }

      setSubmitted(true);
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-green-800">
        <h3 className="mb-2 text-lg font-semibold">Message sent</h3>
        <p>
          Thanks for contacting {siteName}. We aim to reply within 1–2 Australian business days.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submitForm(e.currentTarget);
      }}
      className="space-y-4"
    >
      <div>
        <Label htmlFor="contact-name">Name</Label>
        <Input id="contact-name" name="name" type="text" placeholder="Your name" maxLength={128} />
      </div>

      <div>
        <Label htmlFor="contact-email">
          Email <span className="text-red-500">*</span>
        </Label>
        <Input
          id="contact-email"
          name="email"
          type="email"
          placeholder="you@example.com"
          required
          maxLength={256}
        />
      </div>

      <div>
        <Label htmlFor="contact-subject">Subject</Label>
        <Input
          id="contact-subject"
          name="subject"
          type="text"
          placeholder="How can we help?"
          maxLength={128}
        />
      </div>

      <div>
        <Label htmlFor="contact-message">
          Message <span className="text-red-500">*</span>
        </Label>
        <Textarea
          id="contact-message"
          name="message"
          placeholder="Tell us about your crypto tax question or feedback..."
          required
          minLength={10}
          maxLength={4000}
          rows={5}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" disabled={loading} className="w-full sm:w-auto">
        {loading ? "Sending..." : "Send message"}
      </Button>
    </form>
  );
}
