"use client";

import { useState } from "react";
import { Check, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DialHomepageConfig } from "@/lib/dial-config";
import { Reveal } from "./reveal";

interface NewsletterProps {
  config: DialHomepageConfig;
}

export function Newsletter({ config }: NewsletterProps) {
  const { newsletter } = config;
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  return (
    <section className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
      <Reveal className="relative overflow-hidden rounded-2xl border border-border bg-card px-6 py-12 text-center md:px-12 md:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
        />
        <span className="relative inline-flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Mail className="h-5 w-5" />
        </span>
        <h2 className="relative mt-5 text-balance font-serif text-2xl font-semibold tracking-tight md:text-3xl">
          {newsletter.title}
        </h2>
        <p className="relative mx-auto mt-3 max-w-md text-pretty leading-relaxed text-muted-foreground">
          {newsletter.subtitle}
        </p>

        {submitted ? (
          <p className="relative mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary">
            <Check className="h-4 w-4" />
            {newsletter.successMessage}
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (email) setSubmitted(true);
            }}
            className="relative mx-auto mt-7 flex max-w-md flex-col gap-3 sm:flex-row"
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
              placeholder={newsletter.placeholder}
              className="h-11 flex-1 rounded-md border border-input bg-background px-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40"
            />
            <Button type="submit" size="lg" className="font-medium">
              {newsletter.buttonLabel}
            </Button>
          </form>
        )}
      </Reveal>
    </section>
  );
}
