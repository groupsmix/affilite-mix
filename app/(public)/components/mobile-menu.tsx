"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import type { NavItem } from "@/config/site-definition";

interface MobileMenuProps {
  nav: NavItem[];
  searchLabel?: string;
  direction?: "ltr" | "rtl";
  /**
   * Appearance of the hamburger icon and drawer. "dark" renders a white icon
   * and a dark drawer (for dark-bg headers); "light" renders the default
   * light treatment. Replaces the old `dark` boolean so each header variant
   * can pick its own mobile treatment independently of desktop styling.
   */
  appearance?: "light" | "dark";
}

export function MobileMenu({
  nav,
  searchLabel = "Search",
  direction = "ltr",
  appearance = "light",
}: MobileMenuProps) {
  const dark = appearance === "dark";
  const [open, setOpen] = useState(false);
  const isRtl = direction === "rtl";
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => {
    setOpen(false);
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
    const focusableSelector =
      'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])';
    const focusableElements = drawer.querySelectorAll<HTMLElement>(focusableSelector);
    if (focusableElements.length === 0) return;

    const firstEl = focusableElements[0];
    const lastEl = focusableElements[focusableElements.length - 1];

    firstEl!.focus();

    function handleTab(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      if (e.shiftKey) {
        if (document.activeElement === firstEl) {
          e.preventDefault();
          lastEl!.focus();
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl!.focus();
        }
      }
    }
    drawer.addEventListener("keydown", handleTab);
    return () => drawer.removeEventListener("keydown", handleTab);
  }, [open]);

  const itemClass = `block rounded-md px-3 py-3 text-base font-medium transition-colors ${
    dark
      ? "text-gray-300 hover:bg-white/10 hover:text-white"
      : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
  }`;

  const nestedItemClass = `block rounded-md px-3 py-2 text-sm transition-colors ${
    dark
      ? "text-gray-300 hover:bg-white/10 hover:text-white"
      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
  }`;

  return (
    <>
      <button
        ref={hamburgerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center justify-center rounded-md p-2 md:hidden ${
          dark
            ? "text-gray-300 hover:bg-white/10 hover:text-white"
            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        }`}
        aria-label="Toggle menu"
        aria-expanded={open}
      >
        {open ? (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        ) : (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        )}
      </button>

      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-200 md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={closeMenu}
      />
      <div
        ref={drawerRef}
        role={open ? "dialog" : undefined}
        aria-modal={open ? "true" : undefined}
        aria-label={isRtl ? "القائمة" : "Menu"}
        aria-hidden={!open}
        className={`fixed inset-y-0 ${isRtl ? "left-0" : "right-0"} z-50 w-64 shadow-xl transition-transform duration-200 ease-in-out md:hidden ${
          dark ? "bg-[#0B1120]" : "bg-white"
        } ${open ? "translate-x-0" : isRtl ? "-translate-x-full" : "translate-x-full"}`}
      >
        <div
          className={`flex items-center justify-between px-4 py-3 ${isRtl ? "flex-row-reverse" : ""} ${
            dark ? "border-b border-white/10" : "border-b border-gray-200"
          }`}
        >
          <span className={`text-lg font-bold ${dark ? "text-white" : ""}`}>
            {isRtl ? "القائمة" : "Menu"}
          </span>
          <button
            type="button"
            onClick={closeMenu}
            className={`rounded-md p-2 ${
              dark
                ? "text-gray-400 hover:bg-white/10 hover:text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
            aria-label="Close menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <nav className="flex flex-col px-4 py-4">
          {nav.map((item) => {
            if (item.children && item.children.length > 0) {
              return (
                <details key={item.href} className="group">
                  <summary
                    className={`cursor-pointer list-none rounded-md px-3 py-3 text-base font-medium ${
                      dark ? "text-gray-300" : "text-gray-700"
                    }`}
                  >
                    {item.title}
                  </summary>
                  <div className="pl-3">
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={closeMenu}
                        className={nestedItemClass}
                      >
                        {child.title}
                      </Link>
                    ))}
                  </div>
                </details>
              );
            }
            return (
              <Link key={item.href} href={item.href} onClick={closeMenu} className={itemClass}>
                {item.title}
              </Link>
            );
          })}
          <Link
            href="/search"
            onClick={closeMenu}
            className={`flex items-center gap-2 rounded-md px-3 py-3 text-base font-medium transition-colors ${
              dark
                ? "text-gray-300 hover:bg-white/10 hover:text-white"
                : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
            >
              <path
                fillRule="evenodd"
                d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                clipRule="evenodd"
              />
            </svg>
            {searchLabel}
          </Link>
        </nav>
      </div>
    </>
  );
}
