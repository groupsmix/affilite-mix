"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

const nav = [
  { label: "Reset Routines", href: "/category/reset-routines" },
  { label: "Somatic Practices", href: "/category/somatic-practices" },
  { label: "Reviews", href: "/category/reviews" },
  { label: "Tools", href: "/tools" },
  { label: "About", href: "/about" },
];

export function CalmHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border-subtle bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 py-4">
        <Link
          href="/"
          className="flex items-center gap-2.5"
          aria-label="calmroutine home"
          onClick={() => setOpen(false)}
        >
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-tint"
            aria-hidden="true"
          >
            <span className="h-3 w-3 rounded-full bg-accent-mid" />
          </span>
          <span className="font-serif text-xl leading-none text-text-primary">calmroutine</span>
        </Link>

        {/* Desktop nav */}
        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-1 text-sm text-text-secondary">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="rounded-md px-3 py-1.5 transition-colors hover:bg-accent-tint hover:text-accent-dark"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden md:block">
          <Link
            href="/newsletter"
            className="rounded-lg bg-accent-dark px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-accent-mid"
          >
            Newsletter
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border-subtle text-text-primary md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile nav panel */}
      {open && (
        <nav
          id="mobile-nav"
          aria-label="Mobile"
          className="border-t border-border-subtle bg-background md:hidden"
        >
          <ul className="mx-auto flex max-w-5xl flex-col px-6 py-3">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-2 py-3 text-sm text-text-primary transition-colors hover:bg-accent-tint hover:text-accent-dark"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li className="mt-2 pt-2">
              <Link
                href="/newsletter"
                onClick={() => setOpen(false)}
                className="block rounded-lg bg-accent-dark px-4 py-3 text-center text-sm font-medium text-primary-foreground transition-colors hover:bg-accent-mid"
              >
                Newsletter
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
