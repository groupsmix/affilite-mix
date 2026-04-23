// Visual layout adapted from https://github.com/arhamkhnz/next-shadcn-admin-dashboard (MIT).

"use client";

import { useState, useCallback, useEffect, useRef } from "react";

import { useRouter } from "next/navigation";

import { Loader2 } from "lucide-react";

import TurnstileWidget from "@/app/(public)/components/turnstile-widget";

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

  const [loading, setLoading] = useState(false);

  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const [showForgot, setShowForgot] = useState(false);

  const router = useRouter();

  const handleTurnstileToken = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken(null);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);

    setError("");

    const res = await fetchWithCsrf("/api/auth/login", {
      method: "POST",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({ email: email || undefined, password, turnstileToken }),
    });

    if (res.ok) {
      router.push("/admin");
    } else {
      const data = await res.json();

      setError(data.error ?? "Login failed");
    }

    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1 text-center">
          <CardTitle>
            <h1 className="text-2xl font-bold">Admin Login</h1>
          </CardTitle>

          <CardDescription>Sign in to manage all your sites from one dashboard.</CardDescription>
        </CardHeader>

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
        >
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive" className="bg-red-50 border-red-200 text-red-600">
                <AlertDescription className="text-red-600">{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>

              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                autoComplete="email"
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

            <TurnstileWidget onVerify={handleTurnstileToken} onExpire={handleTurnstileExpire} />

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </CardContent>
        </form>

        <CardFooter className="justify-center">
          <button
            type="button"
            onClick={() => setShowForgot(true)}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            Forgot your password?
          </button>
        </CardFooter>
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

          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();

          first.focus();
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
      const data = await res.json();

      setResetError(data.error ?? "Failed to send reset email");
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
                <Alert variant="destructive" className="bg-red-50 border-red-200 text-red-600">
                  <AlertDescription className="text-red-600">{resetError}</AlertDescription>
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
