// Visual layout adapted from https://github.com/arhamkhnz/next-shadcn-admin-dashboard (MIT).

"use client";

import { useState, useEffect, useRef } from "react";

import { Loader2 } from "lucide-react";

import { fetchWithCsrf } from "@/lib/fetch-csrf";

import { Alert, AlertDescription } from "@/components/ui/alert";

import { Button } from "@/components/ui/button";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");

  const [error, setError] = useState("");

  const [warning, setWarning] = useState("");

  const [loading, setLoading] = useState(false);

  const [showForgot, setShowForgot] = useState(false);

  // A154: Two-factor authentication state
  const [requires2fa, setRequires2fa] = useState(false);

  const [totpToken, setTotpToken] = useState("");

  // E2E testing: signal that React has hydrated the page and event
  // handlers are live. A lightweight data attribute on <body> is the
  // only reliable hydration indicator in React 19 (which no longer
  // attaches __reactFiber$ to DOM nodes).
  useEffect(() => {
    document.body.setAttribute("data-e2e-hydrated", "1");

    // A2: explain a binding/network-triggered logout instead of showing a
    // bare login form. token-refresh.tsx appends ?reason=network_change when
    // a mid-session refresh is rejected (commonly a mobile/CGNAT IP change).
    try {
      const reason = new URLSearchParams(window.location.search).get("reason");
      if (reason === "network_change") {
        setWarning(
          "Your session ended after a network change (for example switching Wi-Fi or mobile networks). Please sign in again.",
        );
      }
    } catch {
      // URLSearchParams unavailable — nothing to surface.
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);

    setError("");

    setWarning("");

    const body: Record<string, unknown> = { email: email || undefined, password };

    // A154: Include TOTP token on second step
    if (requires2fa) {
      body.totp_token = totpToken;
    }

    const res = await fetchWithCsrf("/api/auth/login", {
      method: "POST",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify(body),
    });

    // A1-001: Server returns 202 when TOTP 2FA is required — check BEFORE res.ok
    // because 202 is in the 2xx range and would otherwise enter the success branch.
    if (res.status === 202) {
      const data = await res.json();
      if (data.challenge === "2fa_required") {
        setRequires2fa(true);
        setLoading(false);
        return;
      }
    }

    if (res.ok) {
      const data = await res.json().catch(() => ({}) as Record<string, unknown>);

      // A154: Advisory breached-password notice — do not block login
      if (data.password_breached) {
        setWarning(
          "Your password was found in a known data breach. Please change it after signing in.",
        );
      }

      let redirectTarget = "/q7m-k4j9/sites?needsSite=1";
      try {
        const activeRes = await fetch("/api/admin/sites/active", {
          credentials: "include",
          cache: "no-store",
        });
        if (activeRes.ok) {
          const activeData = (await activeRes.json()) as { activeSiteId?: string | null };
          if (activeData.activeSiteId) redirectTarget = "/q7m-k4j9";
        }
      } catch {
        // If the check fails, send the admin to site selection instead of a broken dashboard.
      }
      window.location.href = redirectTarget;
    } else {
      // BUG-10: guard against non-JSON error responses (e.g. CDN HTML errors)
      // so a parse failure doesn't lock the loading spinner permanently.
      const data = await res.json().catch(() => ({}) as Record<string, unknown>);

      setError(typeof data.error === "string" ? data.error : "Login failed");

      // If TOTP attempt failed, clear the token so the user can retry
      if (requires2fa) {
        setTotpToken("");
      }
    }

    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1 text-center">
          <CardTitle>
            <h1 className="text-2xl font-bold">
              Admin Login
              {/*
                audit5-#29: surface a "DEV" badge on non-production builds
                so an admin on a multi-environment deployment cannot
                accidentally type credentials into the wrong environment.
                `process.env.NODE_ENV` is statically replaced at build
                time by Next.js, so this string-literal compare reduces
                to `false` (no node emitted) on production bundles.
                `NEXT_PUBLIC_APP_ENV_NAME` (if set) overrides with a
                friendlier label like "staging" or "preview".
              */}
              {(process.env.NEXT_PUBLIC_APP_ENV_NAME ||
                (process.env.NODE_ENV !== "production" ? "DEV" : "")) && (
                <span
                  className="ml-2 inline-block rounded bg-amber-500/20 px-2 py-0.5 align-middle text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300"
                  data-testid="admin-login-env-badge"
                >
                  {process.env.NEXT_PUBLIC_APP_ENV_NAME ?? "DEV"}
                </span>
              )}
            </h1>
          </CardTitle>

          <CardDescription>
            {requires2fa
              ? "Enter the 6-digit code from your authenticator app."
              : "Sign in to manage all your sites from one dashboard."}
          </CardDescription>
        </CardHeader>

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
        >
          <CardContent className="space-y-4">
            {error && (
              <Alert
                variant="destructive"
                className="bg-red-50 dark:bg-red-900/20 border-red-200 text-red-600 dark:text-red-400"
              >
                <AlertDescription className="text-red-600 dark:text-red-400">
                  {error}
                </AlertDescription>
              </Alert>
            )}

            {warning && (
              <Alert className="bg-yellow-50 border-yellow-200 text-yellow-800">
                <AlertDescription>{warning}</AlertDescription>
              </Alert>
            )}

            {!requires2fa ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>

                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@example.com"
                    autoComplete="email"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>

                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="totp">Authenticator Code</Label>

                <Input
                  id="totp"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={totpToken}
                  onChange={(e) => setTotpToken(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  autoComplete="one-time-code"
                  autoFocus
                  required
                />

                <p className="text-xs text-muted-foreground">
                  Open your authenticator app and enter the 6-digit code.
                </p>
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  {requires2fa ? "Verifying..." : "Signing in..."}
                </>
              ) : requires2fa ? (
                "Verify Code"
              ) : (
                "Sign in"
              )}
            </Button>

            {requires2fa && (
              <button
                type="button"
                onClick={() => {
                  setRequires2fa(false);
                  setTotpToken("");
                  setError("");
                }}
                className="w-full text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                ← Back to login
              </button>
            )}
          </CardContent>
        </form>

        {!requires2fa && (
          <CardFooter className="justify-center">
            <button
              type="button"
              onClick={() => setShowForgot(true)}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              Forgot your password?
            </button>
          </CardFooter>
        )}
      </Card>

      {showForgot && <ForgotPasswordModal onClose={() => setShowForgot(false)} />}
    </div>
  );
}

function ForgotPasswordModal({ onClose }: { onClose: () => void }) {
  const [resetEmail, setResetEmail] = useState("");

  const [sending, setSending] = useState(false);

  const [sent, setSent] = useState(false);

  const [resetError, setResetError] = useState("");

  const overlayRef = useRef<HTMLDivElement>(null);

  const previousActiveElement = useRef<Element | null>(null);

  useEffect(() => {
    previousActiveElement.current = document.activeElement;

    // Focus the first focusable element inside the modal

    const firstInput = overlayRef.current?.querySelector<HTMLElement>(
      'input, button, [tabindex]:not([tabindex="-1"])',
    );

    firstInput?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();

        return;
      }

      if (e.key === "Tab" && overlayRef.current) {
        const focusable = overlayRef.current.querySelectorAll<HTMLElement>(
          'input, button, [tabindex]:not([tabindex="-1"])',
        );

        if (focusable.length === 0) return;

        const first = focusable[0];

        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();

          last!.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();

          first!.focus();
        }
      }
    }

    // Prevent body scroll

    const origOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);

      document.body.style.overflow = origOverflow;

      // Return focus to trigger button

      if (previousActiveElement.current instanceof HTMLElement) {
        previousActiveElement.current.focus();
      }
    };
  }, [onClose]);

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();

    setSending(true);

    setResetError("");

    const res = await fetchWithCsrf("/api/auth/forgot-password", {
      method: "POST",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({ email: resetEmail }),
    });

    if (res.ok) {
      setSent(true);
    } else {
      const data = await res.json().catch(() => ({}) as Record<string, unknown>);
      setResetError(typeof data.error === "string" ? data.error : "Failed to send reset email");
    }

    setSending(false);
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="forgot-password-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <Card className="mx-auto w-full max-w-sm">
        <CardHeader className="space-y-1">
          <CardTitle>
            <h3 id="forgot-password-title" className="text-lg font-semibold">
              Reset Password
            </h3>
          </CardTitle>

          {!sent && (
            <CardDescription>
              Enter your email address and we&apos;ll send you a link to reset your password.
            </CardDescription>
          )}
        </CardHeader>

        {sent ? (
          <>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                If an account with that email exists, a password reset link has been sent. Check
                your inbox.
              </p>
            </CardContent>

            <CardFooter>
              <Button onClick={onClose} className="w-full">
                Back to Login
              </Button>
            </CardFooter>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              void handleForgot(e);
            }}
          >
            <CardContent className="space-y-4">
              {resetError && (
                <Alert
                  variant="destructive"
                  className="bg-red-50 dark:bg-red-900/20 border-red-200 text-red-600 dark:text-red-400"
                >
                  <AlertDescription className="text-red-600 dark:text-red-400">
                    {resetError}
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>

                <Input
                  id="reset-email"
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="admin@example.com"
                  autoComplete="email"
                  required
                />
              </div>
            </CardContent>

            <CardFooter className="justify-end gap-3">
              <Button type="button" variant="ghost" onClick={onClose} disabled={sending}>
                Cancel
              </Button>

              <Button type="submit" disabled={sending}>
                {sending ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden="true" />
                    Sending...
                  </>
                ) : (
                  "Send Reset Link"
                )}
              </Button>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  );
}
