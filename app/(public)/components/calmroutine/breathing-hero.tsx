"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { type CalmAuthor } from "@/lib/calmroutine";
import Image from "next/image";

export function BreathingHero({ author }: { author: CalmAuthor }) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setSubmitted(true);
  }

  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto flex max-w-5xl flex-col items-center px-6 pb-16 pt-14 text-center sm:pt-20">
        {/* The one animated element on the site: a slow CSS-only breathing pulse. */}
        <div
          className="relative mb-8 flex h-28 w-28 items-center justify-center sm:h-32 sm:w-32"
          aria-hidden="true"
        >
          <span className="breathe absolute inset-0 rounded-full bg-accent-tint" />
          <span
            className="breathe absolute inset-5 rounded-full bg-accent-mid/25"
            style={{ animationDelay: "-2s" }}
          />
          <span className="relative h-5 w-5 rounded-full bg-accent-mid" />
        </div>

        <h1 className="max-w-2xl font-serif text-4xl leading-tight text-text-primary text-balance sm:text-5xl">
          Practical routines to help your nervous system settle
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-text-secondary text-pretty">
          Body-based resets for the morning, the workday, and the evening. One tested routine in
          your inbox each week — nothing else.
        </p>

        {/* Primary conversion: email capture */}
        {submitted ? (
          <p className="mt-8 rounded-lg bg-accent-tint px-5 py-4 text-sm text-accent-dark">
            You&apos;re on the list. The next routine lands in your inbox this week.
          </p>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="mt-8 flex w-full max-w-md flex-col gap-3 sm:flex-row"
          >
            <label htmlFor="hero-email" className="sr-only">
              Email address
            </label>
            <input
              id="hero-email"
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

        <Link
          href="/category/reset-routines"
          className="group mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent-dark"
        >
          Or browse the reset routines
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>

        {/* Trust signals above the fold */}
        <div className="mt-10 flex flex-col items-center gap-3 text-sm text-text-secondary sm:flex-row sm:gap-6">
          <span className="inline-flex items-center gap-2">
            <Image
              src={author.avatarUrl || "/placeholder.svg"}
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 rounded-full object-cover"
            />
            Written by {author.name}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Check className="h-4 w-4 text-accent-mid" />
            Join 4,200+ readers
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-accent-mid" />
            Tools, not treatment
          </span>
        </div>
      </div>
    </section>
  );
}
