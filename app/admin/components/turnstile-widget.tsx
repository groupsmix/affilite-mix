"use client";

import { useEffect, useRef, useCallback } from "react";

const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js";

interface TurnstileWidgetProps {
  onToken: (token: string) => void;
  onExpire?: () => void;
  siteKey?: string;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        },
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

/**
 * Client-side Cloudflare Turnstile widget.
 * Dynamically loads the Turnstile script and renders the challenge.
 * When no siteKey is provided (dev mode), it silently skips rendering.
 */
export function TurnstileWidget({ onToken, onExpire, siteKey }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  const resolvedKey = siteKey ?? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  const renderWidget = useCallback(() => {
    if (!resolvedKey || !containerRef.current || !window.turnstile) return;
    // Avoid double-render
    if (widgetIdRef.current) return;

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: resolvedKey,
      callback: onToken,
      "expired-callback": onExpire,
      theme: "light",
    });
  }, [resolvedKey, onToken, onExpire]);

  useEffect(() => {
    if (!resolvedKey) return;

    // Check if script is already loaded
    if (window.turnstile) {
      renderWidget();
      return;
    }

    // Check if script tag already exists
    const existing = document.querySelector(`script[src="${TURNSTILE_SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener("load", renderWidget);
      return;
    }

    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.addEventListener("load", renderWidget);
    document.head.appendChild(script);

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [resolvedKey, renderWidget]);

  if (!resolvedKey) return null;

  return <div ref={containerRef} className="mt-3" />;
}
