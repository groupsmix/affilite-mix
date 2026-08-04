"use client";

import { useState } from "react";
import { Check } from "lucide-react";
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
    <section className="border-t border-border">
      <Reveal className="mx-auto max-w-2xl px-4 py-16 text-center md:px-6 md:py-20">
        <h2 className="text-balance font-serif text-2xl font-semibold tracking-tight md:text-3xl">
          {newsletter.title}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-pretty leading-relaxed text-muted-foreground">
          {newsletter.subtitle}
        </p>

        {submitted ? (
          <p className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-foreground">
            <Check className="h-4 w-4" />
            {newsletter.successMessage}
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (email) setSubmitted(true);
            }}
            className="mx-auto mt-7 flex max-w-md flex-col gap-3 sm:flex-row"
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
              className="h-11 flex-1 border border-input bg-background px-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-foreground"
            />
            <Button type="submit" size="lg" className="rounded-none font-medium">
              {newsletter.buttonLabel}
            </Button>
          </form>
        )}
      </Reveal>
    </section>
  );
}
