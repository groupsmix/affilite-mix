"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

interface MobileMenuProps {
  nav: { title: string; href: string }[];
  searchLabel?: string;
  direction?: "ltr" | "rtl";
}

export function MobileMenu({ nav, searchLabel = "Search", direction = "ltr" }: MobileMenuProps) {
  const [open, setOpen] = useState(false);
  const isRtl = direction === "rtl";
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => {
    setOpen(false);
    // Return focus to the hamburger button
    hamburgerRef.current?.focus();
  }, []);

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeMenu();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, closeMenu]);

  // Focus trap within the drawer
  useEffect(() => {
    if (!open || !drawerRef.current) return;
    const drawer = drawerRef.current;
    const focusableSelector = 'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])';
    const focusableElements = drawer.querySelectorAll<HTMLElement>(focusableSelector);
    if (focusableElements.length === 0) return;

    const firstEl = focusableElements[0];
    const lastEl = focusableElements[focusableElements.length - 1];

    // Auto-focus the close button (first focusable)
    firstEl.focus();

    function handleTab(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      if (e.shiftKey) {
        if (document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    }
    drawer.addEventListener("keydown", handleTab);
    return () => drawer.removeEventListener("keydown", handleTab);
  }, [open]);

  return (
    <>
      {/* Hamburger button */}
      <button
        ref={hamburgerRef}
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
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-200 md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={closeMenu}
      />
      {/* Drawer — slides from left for RTL, right for LTR */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={isRtl ? "القائمة" : "Menu"}
        aria-hidden={!open}
        className={`fixed inset-y-0 ${isRtl ? "left-0" : "right-0"} z-50 w-64 bg-white shadow-xl transition-transform duration-200 ease-in-out md:hidden ${
          open
            ? "translate-x-0"
            : isRtl
              ? "-translate-x-full"
              : "translate-x-full"
        }`}
      >
            <div className={`flex items-center justify-between border-b border-gray-200 px-4 py-3 ${isRtl ? "flex-row-reverse" : ""}`}>
              <span className="text-lg font-bold">{isRtl ? "القائمة" : "Menu"}</span>
              <button
                type="button"
                onClick={closeMenu}
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
                  onClick={closeMenu}
                  className="rounded-md px-3 py-3 text-base font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900"
                >
                  {item.title}
                </Link>
              ))}
              <Link
                href="/search"
                onClick={closeMenu}
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
  );
}
