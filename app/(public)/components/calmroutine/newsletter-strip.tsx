"use client";

import { useState } from "react";

export function CalmNewsletterStrip({
  heading = "A calmer inbox, once a week",
  description = "One short email with a tested routine and honest tool picks. No spam, unsubscribe anytime.",
}: {
  heading?: string;
  description?: string;
}) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setSubmitted(true);
  }

  return (
    <section className="rounded-xl border border-border-subtle bg-accent-tint px-6 py-10 sm:px-10 sm:py-12">
      <div className="mx-auto max-w-xl text-center">
        <h2 className="font-serif text-2xl text-accent-dark text-balance sm:text-3xl">{heading}</h2>
        <p className="mt-3 leading-relaxed text-text-secondary text-pretty">{description}</p>

        {submitted ? (
          <p className="mt-6 rounded-lg bg-card px-5 py-4 text-sm text-accent-dark">
            You&apos;re on the list. The next routine lands in your inbox this week.
          </p>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mx-auto mt-6 flex max-w-md flex-col gap-3 sm:flex-row"
          >
            <label htmlFor="newsletter-email" className="sr-only">
              Email address
            </label>
            <input
              id="newsletter-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="flex-1 rounded-lg border border-border-subtle bg-card px-4 py-3 text-sm text-text-primary outline-none focus:border-accent-mid"
            />
            <button
              type="submit"
              className="rounded-lg bg-accent-dark px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-accent-mid"
            >
              Join free
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
