"use client";

import { useState } from "react";
import Link from "next/link";

interface MobileMenuProps {
  nav: { title: string; href: string }[];
  searchLabel?: string;
}

export function MobileMenu({ nav, searchLabel = "Search" }: MobileMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Hamburger button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center justify-center rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 md:hidden"
        aria-label="Toggle menu"
        aria-expanded={open}
      >
        {open ? (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {/* Mobile drawer */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/30 md:hidden"
            onClick={() => setOpen(false)}
          />
          {/* Drawer */}
          <div className="fixed inset-y-0 right-0 z-50 w-64 bg-white shadow-xl md:hidden">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <span className="text-lg font-bold">Menu</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-2 text-gray-600 hover:bg-gray-100"
                aria-label="Close menu"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="flex flex-col px-4 py-4">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="rounded-md px-3 py-3 text-base font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900"
                >
                  {item.title}
                </Link>
              ))}
              <Link
                href="/search"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-md px-3 py-3 text-base font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
                </svg>
                {searchLabel}
              </Link>
            </nav>
          </div>
        </>
      )}
    </>
  );
}
