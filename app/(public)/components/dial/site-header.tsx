"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import type { SiteDefinition } from "@/config/site-definition";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navLinks = [
  { label: "Under $200", href: "/guide/best-watches-under-200" },
  { label: "Under $300", href: "/guide/best-watches-under-300" },
  { label: "Under $500", href: "/guide/best-watches-under-500" },
  { label: "Top Picks", href: "#top-picks" },
  { label: "How We Test", href: "#how-we-test" },
];

interface SiteHeaderProps {
  site: SiteDefinition;
}

export function SiteHeader({ site }: SiteHeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled ? "border-b border-border/60 bg-background/90 backdrop-blur-md" : "bg-transparent",
      )}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/60 bg-primary/10 text-primary">
            <span className="h-2 w-2 rounded-full bg-primary" />
          </span>
          <span className="text-lg font-semibold tracking-tight font-playfair">{site.name}</span>
        </Link>

        <ul className="hidden items-center gap-6 md:flex">
          {navLinks.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="hidden md:block">
          <Button asChild>
            <a href="#top-picks">See top picks</a>
          </Button>
        </div>

        <button
          aria-label="Toggle menu"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground md:hidden"
          onClick={() => setMobileOpen((open) => !open)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {mobileOpen && (
        <div className="border-b border-border/60 bg-background/95 px-4 pb-4 backdrop-blur-md md:hidden">
          <ul className="flex flex-col gap-3 pt-2">
            {navLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="block text-sm font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <Button className="w-full" asChild>
              <a href="#top-picks" onClick={() => setMobileOpen(false)}>
                See top picks
              </a>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
