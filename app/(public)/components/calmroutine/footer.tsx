import Link from "next/link";

export function CalmFooter({ siteName, description }: { siteName: string; description: string }) {
  return (
    <footer className="mt-20 border-t border-border-subtle bg-accent-tint/40">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-tint"
                aria-hidden="true"
              >
                <span className="h-3 w-3 rounded-full bg-accent-mid" />
              </span>
              <span className="font-serif text-lg text-text-primary">{siteName}</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-text-secondary">{description}</p>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm">
            <Link
              href="/category/reset-routines"
              className="text-text-secondary hover:text-accent-dark"
            >
              Reset Routines
            </Link>
            <Link href="/newsletter" className="text-text-secondary hover:text-accent-dark">
              Newsletter
            </Link>
            <Link
              href="/category/somatic-practices"
              className="text-text-secondary hover:text-accent-dark"
            >
              Somatic Practices
            </Link>
            <Link href="/about" className="text-text-secondary hover:text-accent-dark">
              About
            </Link>
            <Link href="/category/reviews" className="text-text-secondary hover:text-accent-dark">
              Reviews
            </Link>
            <Link href="/tools" className="text-text-secondary hover:text-accent-dark">
              Recommended tools
            </Link>
            <Link href="/contact" className="text-text-secondary hover:text-accent-dark">
              Contact
            </Link>
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-border-subtle pt-6 text-xs text-text-secondary sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {siteName}. Educational content — not medical advice.
          </p>
          <div className="flex gap-4">
            <Link href="/affiliate-disclosure" className="hover:text-accent-dark">
              Affiliate disclosure
            </Link>
            <Link href="/privacy" className="hover:text-accent-dark">
              Privacy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
