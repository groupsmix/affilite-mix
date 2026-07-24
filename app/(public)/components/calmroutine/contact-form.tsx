"use client";

import { useState } from "react";

export function CalmContactForm() {
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="rounded-xl border border-border-subtle bg-accent-tint px-6 py-8 text-center">
        <h2 className="font-serif text-2xl text-accent-dark">Thank you</h2>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">
          Your message is on its way. I&apos;ll reply as soon as I can.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(true);
      }}
      className="space-y-5"
    >
      <div>
        <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-text-primary">
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          className="w-full rounded-lg border border-border-subtle bg-card px-4 py-3 text-sm outline-none focus:border-accent-mid"
        />
      </div>
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-text-primary">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full rounded-lg border border-border-subtle bg-card px-4 py-3 text-sm outline-none focus:border-accent-mid"
        />
      </div>
      <div>
        <label htmlFor="message" className="mb-1.5 block text-sm font-medium text-text-primary">
          Message
        </label>
        <textarea
          id="message"
          name="message"
          required
          rows={5}
          className="w-full resize-y rounded-lg border border-border-subtle bg-card px-4 py-3 text-sm outline-none focus:border-accent-mid"
        />
      </div>
      <button
        type="submit"
        className="rounded-lg bg-accent-dark px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-accent-mid"
      >
        Send message
      </button>
    </form>
  );
}
